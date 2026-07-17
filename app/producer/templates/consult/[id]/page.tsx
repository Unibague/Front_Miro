"use client";

import { useRouter, useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import axios from "axios";
import {
  Container,
  Table,
  Title,
  Text,
  ScrollArea,
  Center,
  Tooltip,
  Button,
  Group,
  Badge,
  Box,
  ActionIcon,
  Select,
} from "@mantine/core";
import { useSession } from "next-auth/react";
import { IconCheck, IconX, IconArrowLeft, IconTableRow, IconFilter, IconDownload } from "@tabler/icons-react";
import dayjs from "dayjs";
import "dayjs/locale/es";
import DateConfig, { dateToGMT } from "@/app/components/DateConfig";
import FilterSidebar from "@/app/components/FilterSidebar";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { showNotification } from "@mantine/notifications";
import { paramId } from "@/app/utils/routeParams";

interface RowData {
  [key: string]: any;
}

// Vista de consulta para PRODUCTORES (encargados o no): solo muestra la
// informacion ya cargada, sin la pestana "Resumen de Envios" (esa lista de
// TODAS las dependencias asignadas, enviaron o no, es informacion de
// administracion/seguimiento que no le corresponde ver al productor). El
// alcance de los datos depende de si es el productor encargado de la
// plantilla:
//  - Encargado: ve la informacion de TODAS las dependencias que ya enviaron.
//  - Productor normal: ve UNICAMENTE lo que el mismo envio.
const ProducerConsultTemplatePage = () => {
  const router = useRouter();
  const params = useParams();
  const id = paramId(params);
  const searchParams = useSearchParams();
  const isEncargado = searchParams?.get("isEncargado") === "true";

  const [tableData, setTableData] = useState<RowData[]>([]);
  const [originalTableData, setOriginalTableData] = useState<RowData[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState(
    searchParams?.get("sheet") || ""
  );
  const { data: session } = useSession();
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<Record<string, string[]>>({});
  const [savedFilters, setSavedFilters] = useState<Record<string, any[]>>({});
  const [fieldComments, setFieldComments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const fetchDependenciesNames = async (depCodes: string[]) => {
    try {
      const response = await axios.post(
        `${process.env.NEXT_PUBLIC_API_URL}/dependencies/names`,
        { codes: depCodes }
      );
      return response.data;
    } catch (error) {
      console.error("Error fetching dependency names:", error);
      return [];
    }
  };

  useEffect(() => {
    const fetchTemplateName = async () => {
      try {
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/pTemplates/template/${id}`
        );
        setTemplateName(response.data.name || "Plantilla sin nombre");

        if (response.data.publishedTemplate?.template?.fields) {
          const comments: Record<string, string> = {};
          response.data.publishedTemplate.template.fields.forEach((field: any) => {
            if (field.comment && field.comment.trim()) {
              comments[field.name] = field.comment;
            }
          });
          setFieldComments(comments);
        }
      } catch (error: any) {
        console.error("Error fetching template name:", error);
        if (error.response?.status === 403) {
          router.push("/dashboard");
        }
      }
    };

    const fetchUploadedData = async () => {
      if (!id || !session?.user?.email) return;
      setLoading(true);
      try {
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/pTemplates/dimension/mergedData`,
          {
            params: {
              pubTem_id: id,
              email: session?.user?.email,
              filterByUserScope: true,
              userRole: "Productor",
              // El encargado consulta lo enviado por TODAS las dependencias;
              // el productor normal solo lo que el mismo envio.
              filterByUserDependency: !isEncargado,
              ...(selectedSheet && { sheetName: selectedSheet }),
            },
          }
        );

        const availableSheets = Array.isArray(response.data.sheets)
          ? response.data.sheets.filter(
              (name: unknown): name is string =>
                typeof name === "string" && name.length > 0
            )
          : [];
        setSheetNames(availableSheets);

        if (!selectedSheet && availableSheets.length > 1) {
          setSelectedSheet(availableSheets[0]);
          return;
        }

        const data = response.data.data;

        if (Array.isArray(data) && data.length > 0) {
          const depCodes = data.map((row: RowData) => row.Dependencia);
          const dependencyNames = await fetchDependenciesNames(depCodes);

          const updatedData = data.map((row: RowData) => {
            const dependencyName = dependencyNames.find(
              (dep: { code: string; name: string }) => dep.code === row.Dependencia
            );
            return {
              ...row,
              Dependencia: dependencyName ? dependencyName.name : row.Dependencia,
            };
          });

          setTableData(updatedData);
          setOriginalTableData(updatedData);
        } else {
          setTableData([]);
          setOriginalTableData([]);
        }
      } catch (error: any) {
        console.error("Error fetching uploaded data:", error);
        showNotification({
          title: "Error",
          message: "No se pudo cargar la información enviada.",
          color: "red",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchTemplateName();
    fetchUploadedData();

    if (id) {
      const savedConfig = localStorage.getItem(`template_filters_${id}`);
      if (savedConfig) {
        try {
          const config = JSON.parse(savedConfig);
          setSavedFilters({ [id as string]: config.filters });
        } catch (error) {
          console.error("Error loading saved filter config:", error);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, session, selectedSheet, isEncargado]);

  useEffect(() => {
    const urlParams = new URLSearchParams(searchParams?.toString() ?? "");
    if (selectedSheet) {
      urlParams.set("sheet", selectedSheet);
    } else {
      urlParams.delete("sheet");
    }
    window.history.replaceState(null, "", `?${urlParams.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSheet]);

  const isValidDateString = (value: string) => {
    return (
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/.test(value) ||
      /^\d{4}-\d{2}-\d{2}$/.test(value) ||
      /^\d{4}\/\d{2}\/\d{2}$/.test(value)
    );
  };

  const truncateText = (text: string, maxLines: number = 3) => {
    if (!text || typeof text !== "string") return text;
    const words = text.split(" ");
    const wordsPerLine = 8;
    const maxWords = maxLines * wordsPerLine;
    if (words.length <= maxWords) return text;
    return words.slice(0, maxWords).join(" ") + "...";
  };

  const renderCellContent = (value: any, fieldName?: string) => {
    if (value === undefined || value === null || value === "") {
      return (
        <Text size="sm" c="dimmed">
          Sin datos
        </Text>
      );
    }

    if (typeof value === "boolean") {
      return value ? <IconCheck color="green" size={20} /> : <IconX color="red" size={20} />;
    }

    if (
      typeof value === "string" &&
      isValidDateString(value) &&
      isNaN(Number(value)) &&
      dayjs(value).isValid()
    ) {
      return dateToGMT(value, "YYYY/MM/DD");
    }

    if (typeof value === "object" && value !== null) {
      if (Array.isArray(value)) {
        if (value.length === 0) return <Text size="sm">-</Text>;
        const arrayText = value
          .map((item) => {
            if (typeof item === "object" && item !== null) {
              if (item.hyperlink || item.text || item.formula) {
                return item.text || item.hyperlink || item.formula;
              }
              const possibleEmailKeys = ["email", "value", "label", "mail", "correo", "address", "emailAddress"];
              const itemEmailKey = possibleEmailKeys.find((key) => item[key] && typeof item[key] === "string");
              return itemEmailKey ? item[itemEmailKey] : item.text || JSON.stringify(item);
            }
            return item;
          })
          .join(", ");

        if (arrayText.length > 50) {
          return (
            <Tooltip label={arrayText} multiline maw={300}>
              <Text size="sm" lineClamp={3}>
                {truncateText(arrayText)}
              </Text>
            </Tooltip>
          );
        }
        return <Text size="sm">{arrayText}</Text>;
      }

      if (value.hyperlink || value.text || value.formula) {
        const displayText = value.text || value.hyperlink || value.formula;
        if (displayText.length > 50) {
          return (
            <Tooltip label={displayText} multiline maw={300}>
              <Text size="sm" lineClamp={3}>
                {truncateText(displayText)}
              </Text>
            </Tooltip>
          );
        }
        return <Text size="sm">{displayText}</Text>;
      }

      if (typeof value.text === "string") {
        return (
          <Tooltip label={value.text} multiline maw={300}>
            <Text size="sm" lineClamp={3}>
              {truncateText(value.text)}
            </Text>
          </Tooltip>
        );
      }

      const mongoNumeric = value?.$numberInt || value?.$numberDouble;
      if (mongoNumeric !== undefined) return mongoNumeric;

      const possibleEmailKeys = ["email", "value", "label", "mail", "correo", "address", "emailAddress"];
      const emailKey = possibleEmailKeys.find((key) => value[key] && typeof value[key] === "string");
      if (emailKey) {
        return <Text size="sm">{value[emailKey]}</Text>;
      }

      const objectValues = Object.values(value).filter((val) => typeof val === "string" && val.length > 0);
      if (objectValues.length > 0) {
        const firstStringValue = objectValues[0] as string;
        if (firstStringValue.includes("@") || firstStringValue.includes(".com") || firstStringValue.includes(".edu")) {
          return <Text size="sm">{firstStringValue}</Text>;
        }
      }

      const jsonString = JSON.stringify(value);
      return (
        <Tooltip label={jsonString} multiline maw={300}>
          <Text size="sm" lineClamp={3}>
            {truncateText(jsonString)}
          </Text>
        </Tooltip>
      );
    }

    const stringValue = (value ?? "").toString();
    if (stringValue.length > 50) {
      return (
        <Tooltip label={stringValue} multiline maw={300}>
          <Text size="sm" lineClamp={3}>
            {truncateText(stringValue)}
          </Text>
        </Tooltip>
      );
    }
    return <Text size="sm">{stringValue}</Text>;
  };

  const downloadExcel = async (data: RowData[], fileName: string) => {
    if (data.length === 0) {
      showNotification({ title: "Sin datos", message: "No hay datos para descargar", color: "orange" });
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(templateName || "Datos");
    const columns = Object.keys(data[0]);

    const headerRow = worksheet.addRow(columns);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "0f1f39" } };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    data.forEach((row) => {
      const rowValues = columns.map((column) => {
        const value = row[column];
        if (value === null || value === undefined) return "";
        if (typeof value === "boolean") return value ? "Sí" : "No";

        if (typeof value === "object") {
          if (value.hyperlink || value.text || value.formula) return value.text || value.hyperlink || value.formula;
          if (value.text) return value.text;
          const mongoNumeric = value?.$numberInt || value?.$numberDouble;
          if (mongoNumeric !== undefined) return mongoNumeric;

          const possibleEmailKeys = ["email", "value", "label", "mail", "correo", "address", "emailAddress"];
          const emailKey = possibleEmailKeys.find((key) => value[key] && typeof value[key] === "string");
          if (emailKey) return value[emailKey];

          if (Array.isArray(value)) {
            if (value.length === 0) return "";
            return value
              .map((item) => {
                if (typeof item === "object" && item !== null) {
                  if (item.hyperlink || item.text || item.formula) return item.text || item.hyperlink || item.formula;
                  const itemEmailKey = possibleEmailKeys.find((key) => item[key] && typeof item[key] === "string");
                  return itemEmailKey ? item[itemEmailKey] : item.text || JSON.stringify(item);
                }
                return item;
              })
              .join(", ");
          }

          const objectValues = Object.values(value).filter((val) => typeof val === "string" && val.length > 0);
          if (objectValues.length > 0) {
            const firstStringValue = objectValues[0] as string;
            if (firstStringValue.includes("@") || firstStringValue.includes(".com") || firstStringValue.includes(".edu")) {
              return firstStringValue;
            }
          }
          return JSON.stringify(value);
        }

        if (typeof value === "string" && isValidDateString(value) && dayjs(value).isValid()) {
          return dayjs(value).format("YYYY/MM/DD");
        }
        return value.toString();
      });

      const dataRow = worksheet.addRow(rowValues);
      dataRow.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
    });

    worksheet.columns.forEach((column) => {
      column.width = 20;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/octet-stream" });
    saveAs(blob, `${fileName}.xlsx`);

    showNotification({
      title: "Éxito",
      message: `Archivo ${fileName}.xlsx descargado exitosamente`,
      color: "green",
    });
  };

  const handleDownloadFiltered = () => downloadExcel(tableData, `${templateName}_filtrado`);
  const handleDownloadAll = () => downloadExcel(originalTableData, `${templateName}_completo`);

  const handleFiltersChange = (filters: Record<string, string[]>) => {
    setAppliedFilters(filters);

    if (Object.keys(filters).length === 0 || Object.values(filters).every((arr) => arr.length === 0)) {
      setTableData(originalTableData);
      return;
    }

    let filteredData = [...originalTableData];

    Object.entries(filters).forEach(([filterName, values]) => {
      if (values.length === 0) return;

      filteredData = filteredData.filter((row) => {
        const fieldNames = Object.keys(row);
        let matchingField = fieldNames.find(
          (field) => field.toLowerCase().replace(/[^a-z0-9]/g, "_") === filterName
        );
        if (!matchingField) matchingField = fieldNames.find((field) => field === filterName);
        if (!matchingField) {
          matchingField = fieldNames.find((field) => field.toLowerCase() === filterName.toLowerCase());
        }
        if (!matchingField) {
          matchingField = fieldNames.find(
            (field) =>
              field.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() ===
              filterName.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()
          );
        }
        if (!matchingField) return true;

        const fieldValue = row[matchingField];
        let cellText = "";
        if (fieldValue === null || fieldValue === undefined) {
          cellText = "";
        } else if (typeof fieldValue === "object") {
          if (fieldValue.hyperlink || fieldValue.text || fieldValue.formula) {
            cellText = (fieldValue.text || fieldValue.hyperlink || fieldValue.formula).toString();
          } else if (fieldValue.text) {
            cellText = fieldValue.text.toString();
          } else {
            const possibleEmailKeys = ["email", "value", "label", "mail", "correo", "address", "emailAddress"];
            const emailKey = possibleEmailKeys.find((key) => fieldValue[key] && typeof fieldValue[key] === "string");
            if (emailKey) {
              cellText = fieldValue[emailKey].toString();
            } else if (Array.isArray(fieldValue)) {
              cellText = fieldValue.length === 0
                ? ""
                : fieldValue
                    .map((item) => {
                      if (typeof item === "object" && item !== null) {
                        if (item.hyperlink || item.text || item.formula) return item.text || item.hyperlink || item.formula;
                        const itemEmailKey = possibleEmailKeys.find((key) => item[key] && typeof item[key] === "string");
                        return itemEmailKey ? item[itemEmailKey] : item.text || JSON.stringify(item);
                      }
                      return item;
                    })
                    .join(", ");
            } else {
              const objectValues = Object.values(fieldValue).filter((val) => typeof val === "string" && val.length > 0);
              if (objectValues.length > 0) {
                const firstStringValue = objectValues[0] as string;
                cellText =
                  firstStringValue.includes("@") || firstStringValue.includes(".com") || firstStringValue.includes(".edu")
                    ? firstStringValue
                    : JSON.stringify(fieldValue);
              } else {
                cellText = JSON.stringify(fieldValue);
              }
            }
          }
        } else {
          cellText = fieldValue.toString();
        }

        return values.some((value) => {
          const searchValue = value.toLowerCase().trim();
          const cellValue = cellText.toLowerCase().trim();

          if (filterName.includes("fecha") || filterName.includes("date")) {
            if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
              try {
                const searchDate = new Date(value);
                let cellDate;
                if (typeof fieldValue === "string" && isValidDateString(fieldValue)) {
                  cellDate = new Date(fieldValue);
                } else if (fieldValue instanceof Date) {
                  cellDate = fieldValue;
                } else {
                  return false;
                }
                const searchDateStr = searchDate.toISOString().split("T")[0];
                const cellDateStr = cellDate.toISOString().split("T")[0];
                return searchDateStr === cellDateStr;
              } catch {
                return false;
              }
            }
          }

          return (
            cellValue === searchValue ||
            cellValue.includes(searchValue) ||
            searchValue.includes(cellValue) ||
            (cellValue.includes("-") &&
              searchValue.includes("-") &&
              cellValue.split("-").some((part) => searchValue.includes(part))) ||
            searchValue.split(" ").some((word) => word.length > 2 && cellValue.includes(word))
          );
        });
      });
    });

    setTableData(filteredData);
  };

  return (
    <Box style={{ display: "flex", minHeight: "100vh" }}>
      <FilterSidebar
        onFiltersChange={handleFiltersChange}
        isVisible={sidebarVisible}
        onToggle={() => setSidebarVisible(!sidebarVisible)}
        templateId={id as string}
        templateData={originalTableData}
        savedFilters={savedFilters}
      />

      <Box
        style={{
          flex: 1,
          marginLeft: sidebarVisible ? "20%" : "0",
          transition: "margin-left 0.3s ease",
          padding: "20px",
        }}
      >
        <Container size={"xl"} style={{ maxWidth: "100%", width: "100%" }}>
          <Group justify="space-between" mb="md">
            <Box>
              <Title ta="center">{`Datos Cargados para: ${templateName}`}</Title>
              <Badge color={isEncargado ? "blue" : "teal"} variant="light" mt={6}>
                {isEncargado
                  ? "Vista de productor encargado: información de todas las dependencias que ya enviaron"
                  : "Tu información enviada"}
              </Badge>
            </Box>
            <ActionIcon variant="outline" size="lg" onClick={() => setSidebarVisible(!sidebarVisible)}>
              <IconFilter size={20} />
            </ActionIcon>
          </Group>

          <Group mb="md">
            <Button variant="outline" leftSection={<IconArrowLeft />} onClick={() => router.back()}>
              Ir atrás
            </Button>
            {Object.keys(appliedFilters).length > 0 && (
              <Text size="sm" c="dimmed">
                Mostrando {tableData.length} de {originalTableData.length} registros
              </Text>
            )}
          </Group>

          {sheetNames.length > 1 && (
            <Group mb="md" align="end">
              <Select
                label="Hoja enviada"
                description="Selecciona la hoja de la plantilla que deseas consultar"
                data={sheetNames.map((name) => ({ value: name, label: name }))}
                value={selectedSheet}
                onChange={(value) => {
                  setAppliedFilters({});
                  setTableData([]);
                  setOriginalTableData([]);
                  setSelectedSheet(value || sheetNames[0]);
                }}
                allowDeselect={false}
                searchable
                w={360}
              />
            </Group>
          )}

          {loading ? (
            <Text ta="center">Cargando información...</Text>
          ) : tableData.length === 0 ? (
            <Text ta="center">
              {isEncargado
                ? "Aún no hay información cargada por ninguna dependencia para esta plantilla."
                : "Aún no has enviado información para esta plantilla."}
            </Text>
          ) : (
            <Box>
              <Group justify="space-between" mb="md">
                <Text size="sm" c="dimmed">
                  {tableData.length} registro{tableData.length !== 1 ? "s" : ""} encontrado
                  {tableData.length !== 1 ? "s" : ""}
                </Text>
                <Group gap="xs">
                  <Button
                    variant="outline"
                    size="sm"
                    leftSection={<IconDownload size={16} />}
                    onClick={handleDownloadFiltered}
                    disabled={tableData.length === 0}
                  >
                    Descargar datos {Object.keys(appliedFilters).length > 0 ? "filtrados" : "completos"}
                  </Button>
                  {Object.keys(appliedFilters).length > 0 && (
                    <Button variant="subtle" size="sm" leftSection={<IconDownload size={16} />} onClick={handleDownloadAll}>
                      Descargar todos los datos
                    </Button>
                  )}
                </Group>
              </Group>

              <Box
                style={{
                  height: "calc(100vh - 320px)",
                  border: "1px solid #e9ecef",
                  borderRadius: "8px",
                  overflow: "hidden",
                }}
              >
                <ScrollArea style={{ height: "100%" }} scrollbarSize={8}>
                  <Table striped withTableBorder style={{ minWidth: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
                    <Table.Thead
                      style={{ position: "sticky", top: 0, backgroundColor: "#f8f9fa", zIndex: 10 }}
                    >
                      <Table.Tr>
                        {tableData.length > 0 &&
                          Object.keys(tableData[0]).map((fieldName, index) => (
                            <Table.Th
                              key={`header-${index}`}
                              style={{
                                minWidth: "140px",
                                maxWidth: "180px",
                                padding: "12px 8px",
                                backgroundColor: "#f8f9fa",
                                border: "1px solid #dee2e6",
                                borderBottom: "2px solid #dee2e6",
                                cursor: "help",
                              }}
                            >
                              {(() => {
                                let comment = fieldComments[fieldName];
                                if (!comment) {
                                  const fieldKeys = Object.keys(fieldComments);
                                  const normalizedFieldName = fieldName.replace(/[_\s-]/g, "").toLowerCase();
                                  const matchingKey = fieldKeys.find(
                                    (key) => key.replace(/[_\s-]/g, "").toLowerCase() === normalizedFieldName
                                  );
                                  if (matchingKey) comment = fieldComments[matchingKey];
                                }
                                const tooltipLabel = comment || "Campo vacío - Sin PISTA";
                                return (
                                  <Tooltip
                                    label={tooltipLabel}
                                    multiline
                                    maw={300}
                                    position="top"
                                    withArrow
                                    transitionProps={{ transition: "fade", duration: 200 }}
                                  >
                                    <Text size="xs" fw={700} ta="center" c="dark">
                                      {fieldName.replace(/_/g, " ")}
                                    </Text>
                                  </Tooltip>
                                );
                              })()}
                            </Table.Th>
                          ))}
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {tableData.map((rowData, rowIndex) => {
                        const fieldNames = Object.keys(tableData[0]);
                        return (
                          <Table.Tr key={`row-${rowIndex}`}>
                            {fieldNames.map((fieldName, cellIndex) => (
                              <Table.Td
                                key={`cell-${rowIndex}-${cellIndex}`}
                                style={{
                                  minWidth: "140px",
                                  maxWidth: "180px",
                                  padding: "10px 8px",
                                  verticalAlign: "top",
                                  border: "1px solid #dee2e6",
                                }}
                              >
                                {renderCellContent(rowData[fieldName], fieldName)}
                              </Table.Td>
                            ))}
                          </Table.Tr>
                        );
                      })}
                    </Table.Tbody>
                  </Table>
                </ScrollArea>
              </Box>
            </Box>
          )}
        </Container>
      </Box>
      <DateConfig />
    </Box>
  );
};

export default ProducerConsultTemplatePage;
