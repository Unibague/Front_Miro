"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import axios from "axios";
import Image from "next/image";
import {
  ActionIcon, Badge, Box, Button, Center, Container, Divider,
  Group, Loader, NumberInput, Paper, Select, Stack,
  Table, Text, TextInput, ThemeIcon, Title,
} from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import {
  IconBuilding, IconCalendar, IconCircleCheck,
  IconAlertCircle, IconForms, IconPlus, IconSend, IconTrash,
} from "@tabler/icons-react";
import {
  buildFieldDropdownOptions,
  buildSelectOptionsFromStrings,
  buildValidatorOptions,
  getPreferredValidatorColumnName,
  resolveStoredSelectValue,
} from "../../../utils/validatorOptions";
import { getEffectiveRequired, isBlankRequiredValue } from "../../../utils/requiredFields";
import { getSemesterFromPeriodName, getYearFromPeriodName } from "../../../utils/periodUtils";

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
  periodName?: string | null;
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

        // Inicializar una fila por hoja con AÑO y SEMESTRE prellenados a partir
        // del periodo activo (ej. "2026A" → año 2026, semestre 1); si el nombre
        // del periodo no se puede interpretar, se usa la fecha actual como respaldo.
        const _year = getYearFromPeriodName(fd.periodName) ?? new Date().getFullYear();
        const _semester = getSemesterFromPeriodName(fd.periodName) ?? (new Date().getMonth() < 6 ? 1 : 2);
        const initialRows: Record<string, Record<string, any>[]> = {};
        fd.sheets.forEach(s => {
          const prefilled: Record<string, any> = {};
          if (s.fields?.some(f => f.name.toUpperCase() === 'AÑO')) prefilled['AÑO'] = _year;
          if (s.fields?.some(f => f.name.toUpperCase() === 'SEMESTRE')) prefilled['SEMESTRE'] = _semester;
          initialRows[s.name] = [prefilled];
        });
        setSheetRows(initialRows);
        if (fd.sheets.length > 0) setActiveTab(fd.sheets[0].name);

        // Cargar opciones combinando validador conectado + comentario/dropdown_options,
        // igual que en la edición en línea y en la descarga de la plantilla Excel.
        const allFields = fd.sheets.flatMap(s => s.fields);
        const periodId = fd.periodId;
        const vMap: Record<string, string[]> = {};

        await Promise.all(allFields.map(async (field) => {
          const fieldDropdownOptions = buildFieldDropdownOptions(field);
          let validatorOptionStrings: string[] = [];

          if (field.validate_with && periodId) {
            try {
              let validatorId = '';
              let validateWith = '';
              if (typeof field.validate_with === 'string') {
                const parts = field.validate_with.split(' - ');
                if (parts.length >= 2) {
                  validatorId = parts[parts.length - 1].trim();
                  validateWith = field.validate_with;
                } else if (field.validate_with.trim()) {
                  validatorId = field.validate_with.trim();
                  validateWith = field.validate_with.trim();
                }
              } else if ((field.validate_with as any)?.id) {
                validatorId = (field.validate_with as any).id;
                validateWith = (field.validate_with as any).name || '';
              }

              if (validatorId) {
                const vRes = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/validators/id`, {
                  params: { id: validatorId, periodId },
                });
                validatorOptionStrings = buildValidatorOptions(
                  vRes.data?.validator,
                  getPreferredValidatorColumnName(validateWith)
                );
              }
            } catch { /* sin opciones de validador */ }
          }

          // Prioridad: comentario/dropdown_options primero; el validador conectado
          // solo se usa como respaldo si el campo no trae opciones ahí. Sin combinar.
          const resolved = buildSelectOptionsFromStrings(
            fieldDropdownOptions.length > 0 ? fieldDropdownOptions : validatorOptionStrings
          ).map((opt) => opt.value);
          if (resolved.length) vMap[field.name] = resolved;
        }));

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
    const year = getYearFromPeriodName(formData?.periodName) ?? new Date().getFullYear();
    const semester = getSemesterFromPeriodName(formData?.periodName) ?? (new Date().getMonth() < 6 ? 1 : 2);
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
          if (getEffectiveRequired(field) && isBlankRequiredValue(rows[i][field.name])) {
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
      {/* Header con logo */}
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
        {/* Tarjeta de información principal */}
        <Paper withBorder radius="lg" p="lg" shadow="sm" mb="lg"
          style={{ borderLeft: "5px solid #1c7ed6", background: "#ffffff" }}>
          <Group gap={12} align="flex-start" mb="lg">
            <ThemeIcon size={44} radius="lg" color="blue" variant="light">
              <IconForms size={22} />
            </ThemeIcon>
            <div style={{ flex: 1 }}>
              <Title order={2} lh={1.2} mb="xs">{formData?.name}</Title>
              <Text size="sm" c="dimmed">Formulario de reporte de información</Text>
            </div>
          </Group>
          
          <Divider my="md" />
          
          {/* Información de contexto */}
          <Group gap="xl" wrap="wrap">
            <Group gap={6}>
              <IconBuilding size={16} color="#1c7ed6" />
              <Text size="sm" fw={500} c="dimmed">Dependencia:</Text>
              <Badge variant="light" color="blue" size="md" radius="md">
                {formData?.dependency}
              </Badge>
            </Group>
            <Group gap={6}>
              <IconCalendar size={16} color="#1c7ed6" />
              <Text size="sm" fw={500} c="dimmed">Fecha límite:</Text>
              <Badge 
                variant="light" 
                size="md" 
                radius="md"
                color={formData?.deadline && new Date(formData.deadline) < new Date() ? "red" : "teal"}>
                {formData?.deadline
                  ? new Date(formData.deadline).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })
                  : "—"}
              </Badge>
            </Group>
          </Group>
        </Paper>

        {/* Contenedor principal de datos */}
        <Paper withBorder radius="lg" shadow="sm" style={{ overflow: "hidden", background: "#ffffff" }}>
          {/* Encabezado de hojas */}
          <Box p="lg" pb="md" style={{ background: "#f9fafc", borderBottom: "1px solid #e9ecef" }}>
            <Group gap={8}>
              <IconForms size={20} color="#1c7ed6" />
              <Title order={4}>Datos a reportar</Title>
            </Group>
          </Box>

          {sheets.length === 0 ? (
            <Box p="xl">
              <Text c="dimmed" ta="center" size="sm">Este formulario no tiene campos configurados.</Text>
            </Box>
          ) : (
            <>
              {/* Pestañas */}
              <Box style={{ borderBottom: "1px solid #e9ecef" }}>
                <Group gap={0} px="lg" wrap="nowrap" style={{ overflowX: "auto" }}>
                  {sheets.map(sheet => (
                    <Group
                      key={sheet.name}
                      gap="xs"
                      p="md"
                      style={{
                        borderBottom: activeTab === sheet.name ? "3px solid #1c7ed6" : "none",
                        cursor: "pointer",
                        color: activeTab === sheet.name ? "#1c7ed6" : "#868e96",
                        fontWeight: activeTab === sheet.name ? 600 : 400,
                        transition: "all 0.2s ease",
                        whiteSpace: "nowrap",
                      }}
                      onClick={() => setActiveTab(sheet.name)}
                    >
                      <Text size="sm">{sheet.name}</Text>
                    </Group>
                  ))}
                </Group>
              </Box>

              {/* Contenido de pestañas */}
              {sheets.map((sheet: Sheet) => {
                if (activeTab !== sheet.name) return null;

                const rows = sheetRows[sheet.name] || [{}];
                // Detectar si tiene campos con multiple=true para mostrar tabla
                // IMPORTANTE: Solo mostrar tabla si hay al menos un campo con multiple=true
                // De lo contrario, mostrar como formulario limpio (vertical)
                const isMultiple = sheet.fields.some(f => f.multiple === true);

                return (
                  <Box key={sheet.name} p="xl">
                    {sheet.fields.length === 0 ? (
                      <Text c="dimmed" size="sm" ta="center" py="lg">
                        Esta hoja no tiene campos configurados.
                      </Text>
                    ) : isMultiple ? (
                      <>
                        {/* Filas múltiples - Sin contenedor, campos directos */}
                        {rows.map((row, rowIdx) => (
                          <div key={rowIdx}>
                            {/* Encabezado de la fila solo si hay más de 1 fila */}
                            {rows.length > 1 && (
                              <Group justify="space-between" align="center" mb="md" mt={rowIdx > 0 ? "lg" : 0}>
                                <Badge variant="light" color="blue" size="lg">
                                  Fila {rowIdx + 1}
                                </Badge>
                                <ActionIcon 
                                  color="red" 
                                  variant="subtle" 
                                  size="md"
                                  onClick={() => removeRow(sheet.name, rowIdx)}
                                  title="Eliminar fila"
                                >
                                  <IconTrash size={18} />
                                </ActionIcon>
                              </Group>
                            )}
                            
                            {/* Campos de la fila en layout vertical */}
                            <Stack gap="md" mb="lg">
                              {sheet.fields.map(field => (
                                <div key={field.name}>
                                  {renderCell(field, row[field.name], v => updateCell(sheet.name, rowIdx, field.name, v), true)}
                                  {field.comment && (
                                    <Text size="xs" c="dimmed" mt={6} style={{ fontStyle: "italic" }}>
                                      {field.comment}
                                    </Text>
                                  )}
                                </div>
                              ))}
                            </Stack>
                          </div>
                        ))}
                      </>
                    ) : (
                      /* Formulario para campos simples */
                      <Stack gap="lg">
                        {sheet.fields.map(field => (
                          <div key={field.name}>
                            {renderCell(field, rows[0]?.[field.name], v => updateCell(sheet.name, 0, field.name, v), true)}
                            {field.comment && (
                              <Text size="xs" c="dimmed" mt={6} style={{ fontStyle: "italic" }}>
                                {field.comment}
                              </Text>
                            )}
                          </div>
                        ))}
                      </Stack>
                    )}
                  </Box>
                );
              })}
            </>
          )}

          {/* Footer con botón de envío */}
          <Divider />
          <Box p="xl" style={{ background: "#f9fafc", display: "flex", justifyContent: "flex-end" }}>
            <Button 
              color="blue" 
              size="lg" 
              radius="lg" 
              loading={submitting}
              leftSection={<IconSend size={18} />} 
              onClick={handleSubmit}
              fw={500}
            >
              Enviar información
            </Button>
          </Box>
        </Paper>
      </Container>
    </Box>
  );

  function renderCell(field: Field, value: any, onChange: (v: any) => void, withLabel = false) {
    const options = validatorOptions[field.name];
    const label   = withLabel ? `${field.name}${getEffectiveRequired(field) ? " *" : ""}` : undefined;

    if (options?.length) {
      const selectOptions = options.map((opt) => ({ value: opt, label: opt }));
      const resolvedValue = value !== null && value !== undefined
        ? resolveStoredSelectValue(value, selectOptions) ?? String(value)
        : null;
      return (
        <Select label={label} placeholder={`Seleccionar ${field.name}`}
          data={options} value={resolvedValue} onChange={onChange}
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
