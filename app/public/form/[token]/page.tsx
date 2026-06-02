"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import axios from "axios";
import Image from "next/image";
import {
  ActionIcon, Badge, Box, Button, Center, Container, Divider,
  Group, Loader, NumberInput, Paper, Select, Stack,
  Table, Tabs, Text, TextInput, ThemeIcon, Title,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import {
  IconBuilding, IconCalendar, IconCircleCheck,
  IconAlertCircle, IconForms, IconPlus, IconSend, IconTrash,
} from "@tabler/icons-react";
import { buildValidatorOptions, getPreferredValidatorColumnName } from "../../../utils/validatorOptions";

interface Field {
  name: string;
  datatype: string;
  required: boolean;
  validate_with?: { id: string; name: string } | string;
  comment?: string;
  multiple: boolean;
  dropdown_options?: string[];
}

interface Sheet {
  name: string;
  fields: Field[];
}

interface FormData {
  name: string;
  dependency: string;
  deadline: string;
  periodId: string;
  sheets: Sheet[];
}

export default function PublicFormPage() {
  const params = useParams<{ token?: string | string[] }>();
  const tokenParam = params?.token;
  const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;

  const [formData, setFormData]   = useState<FormData | null>(null);
  // rows keyed by sheet name
  const [sheetRows, setSheetRows] = useState<Record<string, Record<string, any>[]>>({});
  const [validatorOptions, setValidatorOptions] = useState<Record<string, string[]>>({});
  const [loading, setLoading]     = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      try {
        const res = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/qr/form/${token}`);
        const fd: FormData = res.data;
        setFormData(fd);

        // Inicializar una fila por hoja con AÑO y SEMESTRE prellenados
        const _now = new Date();
        const _year = _now.getFullYear();
        const _semester = _now.getMonth() < 6 ? 1 : 2;
        const initialRows: Record<string, Record<string, any>[]> = {};
        fd.sheets.forEach(s => {
          const prefilled: Record<string, any> = {};
          if (s.fields?.some(f => f.name.toUpperCase() === 'AÑO')) prefilled['AÑO'] = _year;
          if (s.fields?.some(f => f.name.toUpperCase() === 'SEMESTRE')) prefilled['SEMESTRE'] = _semester;
          initialRows[s.name] = [prefilled];
        });
        setSheetRows(initialRows);
        if (fd.sheets.length > 0) setActiveTab(fd.sheets[0].name);

        // Precargar opciones de validadores (todos los campos de todas las hojas)
        const allFields = fd.sheets.flatMap(s => s.fields);
        const vMap: Record<string, string[]> = {};

        allFields.forEach((field) => {
          if (field.dropdown_options?.length) {
            vMap[field.name] = [...new Set(field.dropdown_options.map((option) => String(option).trim()).filter(Boolean))];
          }
        });

        await Promise.all(
          allFields.map(async (field) => {
            if (vMap[field.name]?.length) return;

            if (field.validate_with && typeof field.validate_with === "object") {
              try {
                const vRes = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/validators/id`, {
                  params: { id: field.validate_with.id, periodId: fd.periodId },
                });
                vMap[field.name] = buildValidatorOptions(
                  vRes.data?.validator,
                  getPreferredValidatorColumnName(field.validate_with.name)
                );
              } catch { vMap[field.name] = []; }
            }
          })
        );
        setValidatorOptions(vMap);
      } catch (err: any) {
        setError(err.response?.data?.error || "Enlace no válido o ya expirado.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  const updateCell = (sheetName: string, rowIdx: number, fieldName: string, value: any) => {
    setSheetRows(prev => {
      const rows = [...(prev[sheetName] || [{}])];
      rows[rowIdx] = { ...rows[rowIdx], [fieldName]: value };
      return { ...prev, [sheetName]: rows };
    });
  };

  const addRow = (sheetName: string) => {
    const now = new Date();
    const year = now.getFullYear();
    const semester = now.getMonth() < 6 ? 1 : 2;
    const sheet = formData?.sheets.find(s => s.name === sheetName);
    const prefilled: Record<string, any> = {};
    if (sheet?.fields?.some(f => f.name.toUpperCase() === 'AÑO')) prefilled['AÑO'] = year;
    if (sheet?.fields?.some(f => f.name.toUpperCase() === 'SEMESTRE')) prefilled['SEMESTRE'] = semester;
    setSheetRows(prev => ({ ...prev, [sheetName]: [...(prev[sheetName] || []), prefilled] }));
  };

  const removeRow = (sheetName: string, idx: number) =>
    setSheetRows(prev => ({ ...prev, [sheetName]: (prev[sheetName] || []).filter((_, i) => i !== idx) }));

  const handleSubmit = async () => {
    if (!formData) return;
    // Validar campos requeridos en todas las hojas
    for (const sheet of formData.sheets) {
      const rows = sheetRows[sheet.name] || [];
      for (let i = 0; i < rows.length; i++) {
        for (const field of sheet.fields) {
          if (field.required && !rows[i][field.name]) {
            showNotification({
              title: "Campo requerido",
              message: `"${field.name}" es obligatorio en la hoja "${sheet.name}", fila ${i + 1}`,
              color: "red",
            });
            setActiveTab(sheet.name);
            return;
          }
        }
      }
    }
    setSubmitting(true);
    try {
      const sheetsData = formData.sheets.map(sheet => ({
        name: sheet.name,
        data: sheetRows[sheet.name] || [],
      }));
      await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/qr/submit/${token}`, { sheetsData });
      setSubmitted(true);
    } catch (err: any) {
      showNotification({
        title: "Error al enviar",
        message: err.response?.data?.error || "No se pudo guardar la información",
        color: "red",
      });
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Estados de carga / error / éxito ── */
  if (loading) {
    return (
      <Center h="100vh" style={{ background: "#f8f9ff" }}>
        <Stack align="center" gap="md">
          <Loader color="blue" size="lg" />
          <Text c="dimmed" size="sm">Cargando formulario…</Text>
        </Stack>
      </Center>
    );
  }

  if (error) {
    return (
      <Center h="100vh" style={{ background: "#f8f9ff" }}>
        <Paper withBorder radius="xl" p="xl" shadow="md" style={{ maxWidth: 440, textAlign: "center" }}>
          <ThemeIcon size={56} radius="xl" color="red" variant="light" mx="auto" mb="md">
            <IconAlertCircle size={28} />
          </ThemeIcon>
          <Title order={3} mb="xs">Enlace no disponible</Title>
          <Text c="dimmed" size="sm">{error}</Text>
        </Paper>
      </Center>
    );
  }

  if (submitted) {
    return (
      <Center h="100vh" style={{ background: "#f8f9ff" }}>
        <Paper withBorder radius="xl" p="xl" shadow="md" style={{ maxWidth: 440, textAlign: "center" }}>
          <ThemeIcon size={56} radius="xl" color="teal" variant="light" mx="auto" mb="md">
            <IconCircleCheck size={28} />
          </ThemeIcon>
          <Title order={3} mb="xs" c="teal">¡Información enviada!</Title>
          <Text c="dimmed" size="sm">Los datos fueron recibidos. El coordinador deberá revisarlos y confirmar el envío. Puedes cerrar esta página.</Text>
        </Paper>
      </Center>
    );
  }

  const sheets = formData?.sheets || [];

  return (
    <Box style={{ minHeight: "100vh", background: "#f0f4ff" }}>
      {/* Header */}
      <Box style={{ background: "#ffffff", padding: "12px 32px", borderBottom: "1px solid #dee2e6", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
        <Group gap={10} align="center">
          <Image
            src="/assets/ojoMiro-dark.svg"
            alt="Logo MIRÓ"
            width={48}
            height={48}
            style={{ display: "block" }}
          />
          <Image
            src="/assets/textoMiro-light.svg"
            alt="MIRÓ"
            width={80}
            height={28}
            style={{ display: "block" }}
          />
        </Group>
      </Box>

      <Container size="lg" py="xl">
        {/* Ficha */}
        <Paper withBorder radius="xl" p="xl" shadow="sm" mb="lg"
          style={{ borderLeft: "4px solid #1c7ed6" }}>
          <Group gap={12} align="flex-start" mb="md">
            <ThemeIcon size={44} radius="xl" color="blue" variant="light">
              <IconForms size={22} />
            </ThemeIcon>
            <div>
              <Title order={3} lh={1.2}>{formData?.name}</Title>
              <Text size="sm" c="dimmed" mt={2}>Formulario de reporte de información</Text>
            </div>
          </Group>
          <Divider mb="md" />
          <Group gap="xl" wrap="wrap">
            <Group gap={6}>
              <IconBuilding size={15} color="#868e96" />
              <Text size="sm" c="dimmed">Dependencia:</Text>
              <Badge variant="light" color="blue" size="sm">{formData?.dependency}</Badge>
            </Group>
            <Group gap={6}>
              <IconCalendar size={15} color="#868e96" />
              <Text size="sm" c="dimmed">Fecha límite:</Text>
              <Badge variant="light" size="sm"
                color={formData?.deadline && new Date(formData.deadline) < new Date() ? "red" : "teal"}>
                {formData?.deadline
                  ? new Date(formData.deadline).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })
                  : "—"}
              </Badge>
            </Group>
          </Group>
        </Paper>

        {/* Hojas como pestañas */}
        <Paper withBorder radius="xl" shadow="sm" style={{ overflow: "hidden" }}>
          <Box p="xl" pb="md">
            <Title order={5}>
              <Group gap={8}>
                <IconForms size={18} color="#1c7ed6" />
                Datos a reportar
              </Group>
            </Title>
          </Box>

          {sheets.length === 0 ? (
            <Box p="xl">
              <Text c="dimmed" ta="center" size="sm">Este formulario no tiene campos configurados.</Text>
            </Box>
          ) : (
            <Tabs value={activeTab} onChange={setActiveTab} keepMounted={false}>
              <Tabs.List px="xl" style={{ borderBottom: "1px solid #e9ecef" }}>
                {sheets.map(sheet => (
                  <Tabs.Tab key={sheet.name} value={sheet.name} fw={600}>
                    {sheet.name}
                  </Tabs.Tab>
                ))}
              </Tabs.List>

              {sheets.map(sheet => {
                const rows = sheetRows[sheet.name] || [{}];
                const isMultiple = sheet.fields.some(f => f.multiple);

                return (
                  <Tabs.Panel key={sheet.name} value={sheet.name} p="xl">
                    {sheet.fields.length === 0 ? (
                      <Text c="dimmed" size="sm" ta="center" py="md">Esta hoja no tiene campos configurados.</Text>
                    ) : isMultiple ? (
                      <>
                        <Box style={{ overflowX: "auto" }} mb="md">
                          <Table withTableBorder withColumnBorders style={{ fontSize: 13, minWidth: 500 }}>
                            <Table.Thead style={{ background: "#f0f4ff" }}>
                              <Table.Tr>
                                <Table.Th style={{ width: 36, textAlign: "center" }}>#</Table.Th>
                                {sheet.fields.map(f => (
                                  <Table.Th key={f.name} style={{ whiteSpace: "nowrap" }}>
                                    {f.name}{f.required && <Text span c="red" ml={3}>*</Text>}
                                  </Table.Th>
                                ))}
                                <Table.Th style={{ width: 36 }} />
                              </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                              {rows.map((row, rowIdx) => (
                                <Table.Tr key={rowIdx}>
                                  <Table.Td style={{ textAlign: "center", color: "#adb5bd", fontSize: 12 }}>
                                    {rowIdx + 1}
                                  </Table.Td>
                                  {sheet.fields.map(field => (
                                    <Table.Td key={field.name} style={{ minWidth: 160 }}>
                                      {renderCell(field, row[field.name], v => updateCell(sheet.name, rowIdx, field.name, v))}
                                    </Table.Td>
                                  ))}
                                  <Table.Td>
                                    {rows.length > 1 && (
                                      <ActionIcon color="red" variant="subtle" size="sm"
                                        onClick={() => removeRow(sheet.name, rowIdx)}>
                                        <IconTrash size={14} />
                                      </ActionIcon>
                                    )}
                                  </Table.Td>
                                </Table.Tr>
                              ))}
                            </Table.Tbody>
                          </Table>
                        </Box>
                        <Button leftSection={<IconPlus size={14} />} variant="light" color="blue" size="sm"
                          onClick={() => addRow(sheet.name)}>
                          Agregar fila
                        </Button>
                      </>
                    ) : (
                      <Stack gap="md">
                        {sheet.fields.map(field => (
                          <div key={field.name}>
                            {renderCell(field, rows[0]?.[field.name], v => updateCell(sheet.name, 0, field.name, v), true)}
                            {field.comment && <Text size="xs" c="dimmed" mt={4}>{field.comment}</Text>}
                          </div>
                        ))}
                      </Stack>
                    )}
                  </Tabs.Panel>
                );
              })}
            </Tabs>
          )}

          <Divider />
          <Box p="xl">
            <Group justify="flex-end">
              <Button color="blue" size="md" radius="xl" loading={submitting}
                leftSection={<IconSend size={16} />} onClick={handleSubmit}>
                Enviar información
              </Button>
            </Group>
          </Box>
        </Paper>
      </Container>
    </Box>
  );

  function renderCell(field: Field, value: any, onChange: (v: any) => void, withLabel = false) {
    const options = validatorOptions[field.name];
    const label   = withLabel ? `${field.name}${field.required ? " *" : ""}` : undefined;

    if (options?.length) {
      return (
        <Select label={label} placeholder={`Seleccionar ${field.name}`}
          data={options} value={value ?? null} onChange={onChange}
          searchable clearable radius="md" />
      );
    }
    if (["Entero", "Decimal", "Número", "Porcentaje"].includes(field.datatype)) {
      return (
        <NumberInput label={label} placeholder={field.name}
          value={value ?? ""} onChange={onChange}
          decimalSeparator="," radius="md" />
      );
    }
    return (
      <TextInput label={label} placeholder={field.name}
        value={value ?? ""} onChange={e => onChange(e.currentTarget.value)}
        radius="md" />
    );
  }
}
