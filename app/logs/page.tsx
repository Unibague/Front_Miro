"use client"

import { Container, Table, Title, Text } from '@mantine/core';
import { IconBulb } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

interface ErrorDetail {
  register: number;
  message: string;
  value: any;
}

interface ColumnError {
  column: string;
  errors: ErrorDetail[];
}

const ErrorLogsPage = () => {
  const [columnErrors, setColumnErrors] = useState<ColumnError[]>([]);

  const renderValue = (val: any) => {
  if (val === null || val === undefined || val === '') return "Sin valor";
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
};

  useEffect(() => {
  try {
    const errors = localStorage.getItem('errorDetails');
    if (errors) {
      const parsedErrors = JSON.parse(errors);
      if (Array.isArray(parsedErrors)) {
        setColumnErrors(parsedErrors);
      } else {
        console.warn("Estructura inesperada en errorDetails:", parsedErrors);
        setColumnErrors([]);
      }
    }
  } catch (error) {
    console.error("Error al parsear errorDetails:", error);
    setColumnErrors([]);
  } finally {
    localStorage.removeItem('errorDetails');
  }
}, []);

return (
  <Container size="xl">
    <Title ta="center" order={1} mb="md">¡Advertencia!</Title>
    <Title ta="center" order={3} mb="md">Parece que hubo algo mal al cargar la plantilla</Title>
    <Text c="dimmed" size='xs' ta="center" mt="md">
      <IconBulb color="#797979" size={20} /><br />
      Revisa la siguiente información.
    </Text>

    <Table striped withTableBorder mt="md">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Columna</Table.Th>
          <Table.Th>Fila</Table.Th>
          <Table.Th>Error</Table.Th>
          <Table.Th>Valor encontrado</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {columnErrors.length > 0 && columnErrors.some(c => c.errors.length > 0) ? (
          columnErrors.flatMap((columnError, index) =>
            columnError.errors.map((detail, subIndex) => (
              <Table.Tr key={`${index}-${subIndex}`}>
                <Table.Td>{columnError.column}</Table.Td>
                <Table.Td>{detail.register}</Table.Td>
                <Table.Td>{detail.message}</Table.Td>
                <Table.Td>{renderValue(detail.value)}</Table.Td>
              </Table.Tr>
            ))
          )
        ) : (
          <Table.Tr>
            <Table.Td colSpan={4}>
              <Text c="red" fw={500} ta="center">
                Se detectó un error desconocido. Verifica la estructura del archivo o comunícate con soporte.
              </Text>
            </Table.Td>
          </Table.Tr>
        )}
      </Table.Tbody>
    </Table>

    {columnErrors.length === 0 || columnErrors.every(c => c.errors.length === 0) ? (
      <Text c="dimmed" size="xs" ta="center" mt="md">
        <IconBulb color="#797979" size={20} /><br />
        Si quieres ver los errores de una carga anterior, vuelve a subir el archivo.
      </Text>
    ) : null}
  </Container>
);
};

export default ErrorLogsPage;
