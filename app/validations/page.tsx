"use client";

import React, { useEffect, useState } from 'react';
import {
  Container,
  Grid,
  Text,
  ScrollArea,
  NavLink,
  Title,
  Loader,
  Center,
  Divider,
  Box,
  Stack,
  Table,
  Paper,
  Group,
  Tooltip,
} from '@mantine/core';
import axios from 'axios';
import { IconBulb, IconClipboardCheck, IconCopy } from '@tabler/icons-react';
import { showNotification } from '@mantine/notifications';
import { usePeriod } from '@/app/context/PeriodContext';

interface Validator {
  _id: string;
  name: string;
  description?: string;
  columns: Column[];
}

interface Column {
  name: string;
  is_validator: boolean;
  type: string;
  values: any[];
}

const ValidationsPage = () => {
  const [validators, setValidators] = useState<Validator[]>([]);
  const [selectedValidator, setSelectedValidator] = useState<Validator | null>(null);
  const [loading, setLoading] = useState(false);
  const { selectedPeriodId } = usePeriod();

  const [columnsInfo, setColumnsInfo] = useState<{ name: string; isValidator: boolean }[]>([]);
  const [tableRows, setTableRows] = useState<any[]>([]);

  useEffect(() => {
    const fetchValidators = async () => {
      if (!selectedPeriodId) return;
      try {
        const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/validators/allValidators`, {
          params: { periodId: selectedPeriodId },
        });
        setValidators(response.data.validators);
        if (response.data.validators.length > 0) {
          handleSelectValidator(response.data.validators[0]._id);
        } else {
          setSelectedValidator(null);
          setColumnsInfo([]);
          setTableRows([]);
        }
      } catch (error) {
        console.error("Error al obtener las validaciones:", error);
      }
    };

    fetchValidators();
  }, [selectedPeriodId]);

  const handleSelectValidator = async (id: string) => {
    setLoading(true);
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/validators/id`, {
        params: { id, periodId: selectedPeriodId },
      });
      const validator = response.data.validator;

      const columnsInfo = validator.columns.map((col: Column) => ({
        name: col.name,
        isValidator: col.is_validator,
      }));

      const numRows = Math.max(...validator.columns.map((col: Column) => col.values.length));

      const rows = [];
      for (let i = 0; i < numRows; i++) {
        const row: any = {};
        validator.columns.forEach((col: Column) => {
          row[col.name] = col.values[i] !== undefined ? col.values[i] : '';
        });
        rows.push(row);
      }

      setSelectedValidator(validator);
      setColumnsInfo(columnsInfo);
      setTableRows(rows);
    } catch (error) {
      console.error("Error al obtener la validación:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCellClick = (value: any) => {
    const valueStr = value?.toString() || '';
    navigator.clipboard.writeText(valueStr).then(() => {
      showNotification({
        title: 'Valor copiado',
        message: `El valor "${valueStr}" ha sido copiado al portapapeles`,
        color: 'teal',
        icon: <IconCopy size={16} />,
      });
    }).catch(err => {
      console.error('No se pudo copiar el texto: ', err);
    });
  };

  return (
    <Container size="xl">
      <Grid>
        <Grid.Col span={{ base: 12, md: 3 }}>
          <Box>
            <Title m={5} ta="center">
              Validaciones
            </Title>
            <Text c="dimmed" size="md" ta="center" m="md">
              <IconBulb color="#797979" size={20} />
              <br />
              Selecciona una validación para ver sus detalles
            </Text>
            <Paper shadow="xl" withBorder>
              <ScrollArea style={{ height: '100%' }}>
                <Stack gap={0}>
                  {validators.map((validator) => (
                    <>
                      <NavLink
                        key={validator._id}
                        label={validator.name}
                        active={selectedValidator?._id === validator._id}
                        onClick={() => handleSelectValidator(validator._id)}
                      />
                      <Divider />
                    </>
                  ))}
                </Stack>
              </ScrollArea>
            </Paper>
          </Box>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 9 }}>
          <div style={{ padding: '1rem' }}>
            {loading ? (
              <Center>
                <Loader />
              </Center>
            ) : selectedValidator ? (
              <div>
                <Title ta="center" order={1}>
                  {selectedValidator.name}
                </Title>
                {selectedValidator.description && (
                  <Text mt="md">{selectedValidator.description}</Text>
                )}
                <Title order={4} mt="lg">
                  Datos de la Validación:
                </Title>
                <ScrollArea>
                  <Table
                    mt="md"
                    striped
                    highlightOnHover
                    withColumnBorders
                    withTableBorder
                  >
                    <Table.Thead>
                      <Table.Tr>
                        {columnsInfo.map((col, index) => (
                          <Table.Th key={index}>
                            <Group>
                              <Text fw={500}>{col.name}</Text>
                              {col.isValidator && (
                                <Tooltip label="Columna validadora">
                                  <IconClipboardCheck size={16} />
                                </Tooltip>
                              )}
                            </Group>
                          </Table.Th>
                        ))}
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {tableRows.map((row, rowIndex) => (
                        <Table.Tr key={rowIndex}>
                          {columnsInfo.map((col, colIndex) => {
                            const cellValue = row[col.name];
                            const isValidator = col.isValidator;

                            return (
                              <Table.Td
                                key={colIndex}
                                onClick={isValidator ? () => handleCellClick(cellValue) : undefined}
                                style={{ cursor: isValidator ? 'pointer' : 'default' }}
                              >
                                {cellValue}
                              </Table.Td>
                            );
                          })}
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                    <Table.Caption>
                      Haz clic sobre un valor validador para copiarlo al portapapeles.
                      <br />
                      <IconCopy size={20} />
                    </Table.Caption>
                  </Table>
                </ScrollArea>
              </div>
            ) : (
              <Text>Selecciona una validación de la lista para ver sus detalles.</Text>
            )}
          </div>
        </Grid.Col>
      </Grid>
    </Container>
  );
};

export default ValidationsPage;
