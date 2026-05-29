"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Container, TextInput, Button, Group, Switch, Table, Checkbox, Select, Loader, Center, MultiSelect, Textarea, rem, Tooltip, Tabs, Text, Box, Divider } from "@mantine/core";
import { DateInput } from "@mantine/dates";
import "dayjs/locale/es";
import axios from "axios";
import { showNotification } from "@mantine/notifications";
import { useSession } from "next-auth/react";
import { useRole } from "@/app/context/RoleContext";
import { IconCancel, IconCirclePlus, IconDeviceFloppy, IconGripVertical, IconDownload } from "@tabler/icons-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { logTemplateChange, logFieldChange, logProducerChange, logDimensionChange, compareTemplateChanges } from "@/app/utils/auditUtils";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import {
  applyFieldCommentNote,
  applyValidatorDropdowns,
  applyWorkbookSheetDropdowns,
  extractWorkbookCommentsFromBase64,
  loadWorkbookFromBase64,
  sanitizeSheetName,
} from "@/app/utils/templateUtils";
import { paramId } from "@/app/utils/routeParams";
import { usePeriod } from "@/app/context/PeriodContext";
import { useUnsavedChanges } from "@/app/context/UnsavedChangesContext";

interface Field {
  name: string;
  datatype: string;
  required: boolean;
  multiple: boolean;
  validate_with?: string;
  comment?: string;
  locked?: boolean;
  dropdown_options?: string[];
  header_row?: number;
  column?: number;
}

type FieldKey = "name" | "datatype" | "required" | "validate_with" | "multiple" | "comment";

const allowedDataTypes = [
  "Entero",
  "Decimal",
  "Porcentaje",
  "Texto Corto",
  "Texto Largo",
  "True/False",
  "Fecha",
  "Fecha Inicial / Fecha Final",
  "Link"
];

interface Dependency {
  _id: string;
  name: string;
  responsible: string
}

interface Dimension {
  _id: string;
  name: string;
  responsible: Dependency
}

interface ValidatorOption {
  name: string;
  type: string;
}

interface Validator { 
  name: string;
  values: any[];
}

interface TemplateWorksheet {
  name: string;
  fields: Field[];
  preserveOriginalContent?: boolean;
  rawRows?: any[][];
  cellNotes?: { row: number; col: number; note: string }[];
  columnWidths?: number[];
  producers?: string[];
  shared?: boolean;
}

const UpdateTemplatePage = () => {
  const [name, setName] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileDescription, setFileDescription] = useState("");
  const [fields, setFields] = useState<Field[]>([{ name: "", datatype: "", required: true, validate_with: "", comment: "", multiple: false }]);
  const [active, setActive] = useState(true);
  const [dimension, setDimension] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>([]);
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [selectedDependencies, setSelectedDependencies] = useState<string[]>([]);
  const [validatorOptions, setValidatorOptions] = useState<ValidatorOption[]>([]);
  const [validators, setValidators] = useState<Validator[]>([]);
  const [shared, setShared] = useState(false);
  const [allowsQr, setAllowsQr] = useState(false);
  const [fechaInicio, setFechaInicio] = useState<Date | null>(null);
  const [fechaFinalProductores, setFechaFinalProductores] = useState<Date | null>(null);
  const [fechaFinalResponsables, setFechaFinalResponsables] = useState<Date | null>(null);
  const [fechaFinal, setFechaFinal] = useState<Date | null>(null);
  const [responsibleProducers, setResponsibleProducers] = useState<string[]>([]);
  const [workbookSheets, setWorkbookSheets] = useState<TemplateWorksheet[]>([]);
  const [originalWorkbookBase64, setOriginalWorkbookBase64] = useState("");
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const [newField, setNewField] = useState<Field>({ name: "", datatype: "", required: true, validate_with: "", comment: "", multiple: false });
  const [loading, setLoading] = useState(true);
  const [originalTemplate, setOriginalTemplate] = useState<any>(null);
  const router = useRouter();
  const params = useParams();
  const id = paramId(params);
  const { data: session } = useSession();
  const { userRole } = useRole();
  const { selectedPeriodId } = usePeriod();
  const { setHasChanges, confirmNavigation } = useUnsavedChanges();

  const createEmptyField = (): Field => ({
    name: "",
    datatype: "",
    required: true,
    validate_with: "",
    comment: "",
    multiple: false,
    locked: false,
  });

  const normalizeField = (field: Partial<Field>, defaultLocked: boolean): Field => ({
    name: field.name || "",
    datatype: field.datatype || "",
    required: field.required ?? true,
    validate_with: field.validate_with || "",
    comment: field.comment || "",
    multiple: field.multiple ?? false,
    locked: field.locked ?? defaultLocked,
    dropdown_options: Array.isArray(field.dropdown_options) ? field.dropdown_options : [],
    header_row: field.header_row,
    column: field.column,
  });

  const normalizeWorkbookSheets = (template: any): TemplateWorksheet[] => {
    const sheets = Array.isArray(template?.workbook_sheets)
      ? template.workbook_sheets
      : [];

    return sheets
      .map((sheet: any, index: number) => ({
        name: sheet?.name || `Hoja_${index + 1}`,
        fields: Array.isArray(sheet?.fields)
          ? sheet.fields.map((field: Field) => normalizeField(field, true))
          : [],
        preserveOriginalContent: sheet?.preserveOriginalContent || false,
        rawRows: Array.isArray(sheet?.rawRows) ? sheet.rawRows : undefined,
        cellNotes: Array.isArray(sheet?.cellNotes) ? sheet.cellNotes : undefined,
        columnWidths: Array.isArray(sheet?.columnWidths) ? sheet.columnWidths : undefined,
        producers: Array.isArray(sheet?.producers) ? sheet.producers.map((p: any) => String(p)) : [],
        shared: sheet?.shared ?? false,
      }))
      .filter((sheet: TemplateWorksheet) => sheet.preserveOriginalContent || sheet.rawRows?.length || sheet.fields.length > 0);
  };

  const makeUniqueFieldName = (value: string, usedValues: Map<string, number>) => {
    const base = value.trim() || "Campo";
    const normalized = base.toLowerCase();
    const count = usedValues.get(normalized) || 0;
    usedValues.set(normalized, count + 1);
    return count === 0 ? base : `${base} (${count + 1})`;
  };

  const flattenWorkbookSheets = (sheets: TemplateWorksheet[]) => {
    const usedFieldNames = new Map<string, number>();
    return sheets.flatMap((sheet) =>
      sheet.fields.map((field) => ({
        ...field,
        name: makeUniqueFieldName(field.name, usedFieldNames),
      }))
    );
  };

  const hasWorkbookSheets = workbookSheets.length > 0;
  const activeSheetData = workbookSheets.find((sheet) => sheet.name === activeSheet) || workbookSheets[0];
  const displayedFields = hasWorkbookSheets ? activeSheetData?.fields || [] : fields;

  const isBaseField = (field: Field) => hasWorkbookSheets && field.locked !== false;
  const baseFields = displayedFields.filter(isBaseField);
  const editableFields = displayedFields.filter((f) => !isBaseField(f));

  const setFieldsForActiveSheet = (updater: (currentFields: Field[]) => Field[]) => {
    if (!activeSheetData) return;
    setWorkbookSheets((currentSheets) =>
      currentSheets.map((sheet) =>
        sheet.name === activeSheetData.name
          ? { ...sheet, fields: updater(sheet.fields) }
          : sheet
      )
    );
  };

  const toggleBaseFieldRequired = (fieldName: string, required: boolean) => {
    const updater = (currentFields: Field[]) =>
      currentFields.map((f) => (f.name === fieldName ? { ...f, required } : f));
    if (hasWorkbookSheets) {
      setFieldsForActiveSheet(updater);
    } else {
      setFields(updater);
    }
  };

  const resolveUniqueSheetName = (workbook: ExcelJS.Workbook, rawName: string, fallback: string) => {
    const base = sanitizeSheetName(rawName || fallback) || fallback;
    let candidate = base;
    let counter = 1;

    while (workbook.getWorksheet(candidate)) {
      const suffix = `_${counter}`;
      candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
      counter += 1;
    }

    return candidate;
  };

  useEffect(() => {
    const fetchTemplate = async () => {
      if (id) {
        try {
          const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/templates/${id}`);
          if (response.data) {
            
            setName(response.data.name);
            setFileName(response.data.file_name);
            setFileDescription(response.data.file_description);
            const normalizedSheets = normalizeWorkbookSheets(response.data);
            const nextFields = normalizedSheets.length > 0
              ? flattenWorkbookSheets(normalizedSheets)
              : (response.data.fields || []).map((field: Field) => normalizeField(field, false));
            const firstEditableSheet = normalizedSheets.find(
              (sheet) => !sheet.preserveOriginalContent && sheet.fields.length > 0
            ) || normalizedSheets[0];

            setWorkbookSheets(normalizedSheets);
            setOriginalWorkbookBase64(response.data.original_workbook_base64 || "");
            setActiveSheet(firstEditableSheet?.name || null);
            setFields(nextFields);
            setActive(response.data.active);
            setShared(response.data.shared ?? false);
            setAllowsQr(response.data.allows_qr ?? false);
            setFechaInicio(response.data.fecha_inicio ? new Date(response.data.fecha_inicio) : null);
            setFechaFinalProductores(response.data.fecha_final_productores ? new Date(response.data.fecha_final_productores) : null);
            setFechaFinalResponsables(response.data.fecha_final_responsables ? new Date(response.data.fecha_final_responsables) : null);
            setFechaFinal(response.data.fecha_final ? new Date(response.data.fecha_final) : null);
            setResponsibleProducers((response.data.responsible_producers || []).map((p: any) => String(p)));
            setSelectedDimensions(response.data.dimensions);
            setSelectedDependencies(response.data.producers);
            
            // Guardar estado original para comparar cambios
            setOriginalTemplate({
              name: response.data.name,
              file_description: response.data.file_description,
              fields: nextFields,
              workbook_sheets: normalizedSheets,
              dimensions: response.data.dimensions,
              producers: response.data.producers
            });
          }
        } catch (error) {
          console.error("Error fetching template:", error);
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };

    const fetchDimensions = async () => {
      const userEmail = session?.user?.email;
      try {
        if (userRole === 'Administrador') {
          const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/dimensions`);
          setDimensions(response.data);
        }
      } catch (error) {
        console.error("Error fetching dimensions:", error);
        showNotification({
          title: "Error",
          message: "Hubo un error al obtener los ámbitos",
          color: "red",
        });
      }
    };

    const fetchDependencies = async () => {
      try {
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/dependencies/all/${session?.user?.email}`
        );
        setDependencies(response.data);
      } catch (error) {
        console.error("Error fetching dependencies:", error);
        showNotification({
          title: "Error",
          message: "Hubo un error al obtener las dependencias",
          color: "red",
        });
      }
    }

    const fetchValidatorOptions = async () => {
      try {
        const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/validators/options`, {
          params: { periodId: selectedPeriodId },
        });
        setValidatorOptions(response.data.options);
      } catch (error) {
        console.error("Error fetching validator options:", error);
        showNotification({
          title: "Error",
          message: "Hubo un error al obtener las opciones de validación",
          color: "red",
        });
      }
    };

    const fetchValidators = async () => {
      try {
        const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/templates/${id}`);
        if (response.data?.validators) {
          setValidators(response.data.validators);
        }
      } catch (error) {
        console.error("Error fetching validators:", error);
      }
    };

    fetchDependencies();
    fetchDimensions();
    fetchTemplate();
    fetchValidatorOptions();
    fetchValidators();
  }, [id, session, userRole, selectedPeriodId]);

  const handleFieldChange = (index: number, field: FieldKey, value: any) => {
    setHasChanges(true);
    const updatedFields = [...fields];
    updatedFields[index] = { ...updatedFields[index], [field]: value };

    if (field === 'validate_with') {
      const selectedOption = validatorOptions.find(option => option.name === value);

      if (selectedOption) {
        if (selectedOption.type === 'Número') {
          updatedFields[index].datatype = 'Entero';
        } else if (selectedOption.type === 'Texto') {
          updatedFields[index].datatype = 'Texto Largo';
        }
      } else {
        updatedFields[index].datatype = "";
      }
    }

    setFields(updatedFields);
  };

  const addField = () => {
    setFields([...fields, { name: "", datatype: "", required: true, validate_with: "", comment: "", multiple: false }]);
  };

  const removeField = (index: number) => {
    const updatedFields = fields.filter((_, i) => i !== index);
    setFields(updatedFields);
  };

  const handleDisplayedFieldChange = (index: number, field: FieldKey, value: any) => {
    const applyFieldChange = (currentFields: Field[]) => {
      const updatedFields = [...currentFields];
      const currentField = updatedFields[index];

      if (!currentField || isBaseField(currentField)) {
        return currentFields;
      }

      updatedFields[index] = { ...currentField, [field]: value };

      if (field === 'validate_with') {
        const selectedOption = validatorOptions.find(option => option.name === value);

        if (selectedOption) {
          if (selectedOption.type === 'NÃºmero') {
            updatedFields[index].datatype = 'Entero';
          } else if (selectedOption.type === 'Texto') {
            updatedFields[index].datatype = 'Texto Largo';
          }
        } else {
          updatedFields[index].datatype = "";
        }
      }

      return updatedFields;
    };

    if (hasWorkbookSheets) {
      setFieldsForActiveSheet(applyFieldChange);
    } else {
      setFields(applyFieldChange);
    }
  };

  const addDisplayedField = () => {
    if (!newField.name.trim()) {
      showNotification({ title: "Error", message: "El nombre del campo es requerido", color: "red" });
      return;
    }

    const fieldToAdd: Field = { ...newField, locked: false };

    if (hasWorkbookSheets) {
      const targetSheet = activeSheetData?.name;
      if (!targetSheet) {
        showNotification({ title: "Error", message: "No hay hoja activa seleccionada.", color: "red" });
        return;
      }
      setWorkbookSheets((currentSheets) =>
        currentSheets.map((sheet) =>
          sheet.name === targetSheet
            ? { ...sheet, fields: [...sheet.fields, fieldToAdd] }
            : sheet
        )
      );
      setActiveSheet(targetSheet);
    } else {
      setFields([...fields, fieldToAdd]);
    }

    setNewField({ name: "", datatype: "", required: true, validate_with: "", comment: "", multiple: false });
  };

  const removeDisplayedField = (index: number) => {
    const removeEditableField = (currentFields: Field[]) => {
      const currentField = currentFields[index];
      if (!currentField || isBaseField(currentField)) {
        return currentFields;
      }
      return currentFields.filter((_, i) => i !== index);
    };

    if (hasWorkbookSheets) {
      setFieldsForActiveSheet(removeEditableField);
    } else {
      setFields(removeEditableField);
    }
  };

  const handleSave = async () => {
    setHasChanges(false);
    const fieldsToSave = hasWorkbookSheets ? flattenWorkbookSheets(workbookSheets) : fields;

    const derivedProducers = hasWorkbookSheets
      ? [...new Set(workbookSheets.flatMap(s => s.producers || []))]
      : selectedDependencies;

    const missing: string[] = [];
    if (!name) missing.push("Nombre de la plantilla");
    if (!fileName) missing.push("Nombre del archivo");
    if (!fileDescription) missing.push("Descripción del archivo");
    if (fieldsToSave.length === 0) missing.push("Al menos un campo");
    if (selectedDimensions.length === 0) missing.push("Ámbito");
    if (derivedProducers.length === 0) missing.push("Productores");

    if (missing.length > 0) {
      showNotification({
        id: "save-validation-error",
        title: "Faltan campos requeridos",
        message: missing.join(", "),
        color: "red",
        autoClose: 6000,
      });
      return;
    }

    const templateData = {
      name,
      file_name: fileName,
      file_description: fileDescription,
      fields: fieldsToSave,
      workbook_sheets: hasWorkbookSheets ? workbookSheets : [],
      original_workbook_base64: originalWorkbookBase64 || undefined,
      active,
      shared,
      allows_qr: allowsQr,
      fecha_inicio: fechaInicio,
      fecha_final_productores: fechaFinalProductores,
      fecha_final_responsables: fechaFinalResponsables,
      fecha_final: fechaFinal,
      responsible_producers: responsibleProducers,
      dimensions: selectedDimensions,
      producers: derivedProducers,
      email: session?.user?.email,
      full_name: session?.user?.name
    };

    try {
      const response = await axios.put(`${process.env.NEXT_PUBLIC_API_URL}/templates/${id}`, templateData);
      
      // Registrar cambios en auditoría
      if (originalTemplate && session?.user?.email) {
        await logAuditChanges(originalTemplate, templateData, session.user.email);
      }

if (response.data.warning) {
  showNotification({
    title: "Actualizado con advertencia",
    message: `${response.data.warning} (${response.data.blockedProducers?.length ?? 0}) productores no fueron eliminados.`,
    color: "yellow",
  });
} else {
  showNotification({
    title: "Actualizado",
    message: "Plantilla actualizada exitosamente",
    color: "teal",
  });
}

router.back();

} catch (error: any) {
  console.error("Error guardando plantilla:", error);

  // 💡 Detecta error específico del backend por caracteres inválidos
  if (axios.isAxiosError(error) && error.response?.data?.error) {
    showNotification({
      title: "Error al guardar plantilla:",
      message: error.response.data.error,
      color: "red",
    });
    return;
  }

  // 🟡 Caso de advertencia por productores no eliminables
  if (error.response?.data?.message) {
    showNotification({
      title: "Error",
      message: 'La plantilla se encuentra publicada y ya han hecho cargue de información, no se puede modificar',
      color: "red",
    });
    return;
  }

  // 🔴 Error genérico (último recurso)
  showNotification({
    title: "Error",
    message: "Hubo un error al guardar la plantilla",
    color: "red",
  });
}      
    
  };

  const logAuditChanges = async (oldTemplate: any, newTemplate: any, userEmail: string) => {
    // Comparar nombre
    if (oldTemplate.name !== newTemplate.name) {
      await logTemplateChange(
        id as string,
        newTemplate.name,
        'update',
        userEmail,
        {
          field: 'name',
          oldValue: oldTemplate.name,
          newValue: newTemplate.name,
          action: `Cambió el nombre de "${oldTemplate.name}" a "${newTemplate.name}"`
        }
      );
    }

    // Comparar descripción
    if (oldTemplate.file_description !== newTemplate.file_description) {
      await logTemplateChange(
        id as string,
        newTemplate.name,
        'update',
        userEmail,
        {
          field: 'description',
          oldValue: oldTemplate.file_description,
          newValue: newTemplate.file_description,
          action: `Cambió la descripción de la plantilla "${newTemplate.name}"`
        }
      );
    }

    // Comparar campos
    const oldFields = oldTemplate.fields || [];
    const newFields = newTemplate.fields || [];

    // Campos agregados
    newFields.forEach((newField: Field) => {
      const oldField = oldFields.find((f: Field) => f.name === newField.name);
      if (!oldField) {
        logFieldChange(
          newTemplate.name,
          newField.name,
          'create',
          userEmail,
          { fieldType: newField.datatype, required: newField.required }
        );
      } else if (JSON.stringify(oldField) !== JSON.stringify(newField)) {
        // Campo modificado
        logFieldChange(
          newTemplate.name,
          newField.name,
          'update',
          userEmail,
          { oldField, newField }
        );
      }
    });

    // Campos eliminados
    oldFields.forEach((oldField: Field) => {
      const newField = newFields.find((f: Field) => f.name === oldField.name);
      if (!newField) {
        logFieldChange(
          newTemplate.name,
          oldField.name,
          'delete',
          userEmail,
          { fieldType: oldField.datatype }
        );
      }
    });

    // Comparar productores
    const oldProducers = oldTemplate.producers || [];
    const newProducers = newTemplate.producers || [];

    // Productores agregados
    newProducers.forEach((producerId: string) => {
      if (!oldProducers.includes(producerId)) {
        const producer = dependencies.find(d => d._id === producerId);
        if (producer) {
          logProducerChange(
            newTemplate.name,
            producer.name,
            'create',
            userEmail
          );
        }
      }
    });

    // Productores eliminados
    oldProducers.forEach((producerId: string) => {
      if (!newProducers.includes(producerId)) {
        const producer = dependencies.find(d => d._id === producerId);
        if (producer) {
          logProducerChange(
            newTemplate.name,
            producer.name,
            'delete',
            userEmail
          );
        }
      }
    });

    // Comparar ?mbitos
    const oldDimensions = oldTemplate.dimensions || [];
    const newDimensions = newTemplate.dimensions || [];

    // ?mbitos agregadas
    newDimensions.forEach((dimensionId: string) => {
      if (!oldDimensions.includes(dimensionId)) {
        const dimension = dimensions.find(d => d._id === dimensionId);
        if (dimension) {
          logDimensionChange(
            newTemplate.name,
            dimension.name,
            'create',
            userEmail
          );
        }
      }
    });

    // ?mbitos eliminadas
    oldDimensions.forEach((dimensionId: string) => {
      if (!newDimensions.includes(dimensionId)) {
        const dimension = dimensions.find(d => d._id === dimensionId);
        if (dimension) {
          logDimensionChange(
            newTemplate.name,
            dimension.name,
            'delete',
            userEmail
          );
        }
      }
    });
  };

  const onDragEnd = (result: DropResult) => {
    const { destination, source } = result;

    if (!destination) {
      return;
    }

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    const reorderFields = (currentFields: Field[]) => {
      const bases = currentFields.filter((f) => isBaseField(f));
      const editables = currentFields.filter((f) => !isBaseField(f));
      const reordered = Array.from(editables);
      const [removed] = reordered.splice(source.index, 1);
      reordered.splice(destination.index, 0, removed);
      return [...bases, ...reordered];
    };

    if (hasWorkbookSheets) {
      setFieldsForActiveSheet(reorderFields);
    } else {
      setFields(reorderFields);
    }
  };

  const applySheetHeaders = (
    worksheet: ExcelJS.Worksheet,
    sheetFields: Field[]
  ) => {
    const headerRow = worksheet.addRow(sheetFields.map((f) => f.name));
    headerRow.eachCell((cell, colNumber) => {
      cell.font = { bold: true, color: { argb: "FFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "0f1f39" } };
      cell.border = {
        top: { style: "thin" }, left: { style: "thin" },
        bottom: { style: "thin" }, right: { style: "thin" },
      };
      cell.alignment = { vertical: "middle", horizontal: "center" };
      applyFieldCommentNote(cell, sheetFields[colNumber - 1].comment);
    });
    worksheet.columns.forEach((col) => { col.width = 20; });
  };

  const applySheetDataValidations = (
    worksheet: ExcelJS.Worksheet,
    sheetFields: Field[]
  ) => {
    const maxRows = 1000;
    sheetFields.forEach((field, index) => {
      const colNumber = index + 1;
      for (let i = 2; i <= maxRows; i++) {
        const cell = worksheet.getRow(i).getCell(colNumber);
        switch (field.datatype) {
          case "Entero":
            cell.dataValidation = { type: "whole", operator: "between", formulae: [1, Number.MAX_SAFE_INTEGER], showErrorMessage: true, errorTitle: "Valor no válido", error: "Por favor, introduce un número entero." };
            break;
          case "Decimal":
            cell.dataValidation = { type: "decimal", operator: "between", formulae: [0.0, Number.MAX_SAFE_INTEGER], showErrorMessage: true, errorTitle: "Valor no válido", error: "Por favor, introduce un número decimal." };
            break;
          case "Porcentaje":
            cell.dataValidation = { type: "decimal", operator: "between", formulae: [0.0, 100.0], showErrorMessage: true, errorTitle: "Valor no válido", error: "Por favor, introduce un número decimal entre 0.0 y 100.0." };
            break;
          case "Texto Corto":
            cell.dataValidation = { type: "textLength", operator: "lessThanOrEqual", formulae: [60], showErrorMessage: true, errorTitle: "Valor no válido", error: "Por favor, introduce un texto de hasta 60 caracteres." };
            break;
          case "Texto Largo":
            cell.dataValidation = { type: "textLength", operator: "lessThanOrEqual", formulae: [500], showErrorMessage: true, errorTitle: "Valor no válido", error: "Por favor, introduce un texto de hasta 500 caracteres." };
            break;
          case "True/False":
            cell.dataValidation = { type: "list", allowBlank: true, formulae: ['"Si,No"'], showErrorMessage: true, errorTitle: "Valor no válido", error: "Por favor, selecciona Si o No." };
            break;
          case "Fecha":
          case "Fecha Inicial / Fecha Final":
            cell.dataValidation = { type: "date", operator: "between", formulae: [new Date(1900, 0, 1), new Date(9999, 11, 31)], showErrorMessage: true, errorTitle: "Valor no válido", error: "Por favor, introduce una fecha válida en el formato DD/MM/AAAA." };
            cell.numFmt = "DD/MM/YYYY";
            break;
          case "Link":
            cell.dataValidation = { type: "textLength", operator: "greaterThan", formulae: [0], showErrorMessage: true, errorTitle: "Valor no válido", error: "Por favor, introduce un enlace válido." };
            break;
        }
        if (field.comment && cell.dataValidation) {
          const normalizedComment = field.comment.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
          const promptBase = normalizedComment.slice(0, 220);
          cell.dataValidation = {
            ...cell.dataValidation,
            showInputMessage: true,
            promptTitle: field.name.slice(0, 32),
            prompt: normalizedComment.length > 220 ? `${promptBase}...` : promptBase,
          };
        }
      }
    });
  };

  const handleDownloadTemplate = async () => {
    if (originalWorkbookBase64) {
      const workbook = await loadWorkbookFromBase64(originalWorkbookBase64);
      const originalCommentsBySheet = await extractWorkbookCommentsFromBase64(originalWorkbookBase64);
      applyWorkbookSheetDropdowns({
        workbook,
        workbookSheets,
        validators,
        originalCommentsBySheet,
      });
      const buffer = await workbook.xlsx.writeBuffer();
      saveAs(new Blob([buffer], { type: "application/octet-stream" }), `${fileName}.xlsx`);

      showNotification({
        title: "Ã‰xito",
        message: "Plantilla descargada exitosamente con las validaciones actualizadas",
        color: "green",
      });
      return;
    }

    const workbook = new ExcelJS.Workbook();

    if (hasWorkbookSheets) {
      for (const sheet of workbookSheets) {
        const sheetName = resolveUniqueSheetName(workbook, sheet.name, `Hoja_${workbookSheets.indexOf(sheet) + 1}`);
        if (sheet.preserveOriginalContent) {
          const worksheet = workbook.addWorksheet(sheetName);
          (sheet.rawRows || []).forEach((row) => worksheet.addRow(row || []));
          (sheet.columnWidths || []).forEach((width, index) => {
            worksheet.getColumn(index + 1).width = width || 20;
          });
          (sheet.cellNotes || []).forEach((note) => {
            if (!note?.row || !note?.col || !note?.note) return;
            worksheet.getCell(note.row, note.col).note = note.note;
          });
          applyValidatorDropdowns({ workbook, worksheet, fields: sheet.fields, validators, startRow: 2, endRow: 1000 });
          continue;
        }
        const worksheet = workbook.addWorksheet(sheetName);
        applySheetHeaders(worksheet, sheet.fields);
        applySheetDataValidations(worksheet, sheet.fields);
        applyValidatorDropdowns({ workbook, worksheet, fields: sheet.fields, validators, startRow: 2, endRow: 1000 });
      }
    } else {
      const worksheet = workbook.addWorksheet(name);
      applySheetHeaders(worksheet, fields);
      applySheetDataValidations(worksheet, fields);
      applyValidatorDropdowns({ workbook, worksheet, fields, validators, startRow: 2, endRow: 1000 });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer], { type: "application/octet-stream" }), `${fileName}.xlsx`);

    showNotification({
      title: "Éxito",
      message: "Plantilla descargada exitosamente con las validaciones actualizadas",
      color: "green",
    });
  };

  if (loading) {
    return (
      <Center style={{ height: "100vh" }}>
        <Loader size="xl" />
      </Center>
    );
  }

  return (
    <Container size="xl">
      <TextInput
        label="Nombre"
        placeholder="Nombre de la plantilla"
        value={name}
        onChange={(event) => { setName(event.currentTarget.value); setHasChanges(true); }}
        mb="md"
      />
      <TextInput
        label="Nombre del Archivo"
        placeholder="Nombre del archivo"
        value={fileName}
        onChange={(event) => { setFileName(event.currentTarget.value); setHasChanges(true); }}
        mb="md"
      />
      <TextInput
        label="Descripción del Archivo"
        placeholder="Descripción del archivo"
        value={fileDescription}
        onChange={(event) => { setFileDescription(event.currentTarget.value); setHasChanges(true); }}
        mb="md"
      />
      {userRole === "Administrador" && (
      <MultiSelect
        mb={'xs'}
        label="Ámbitos"
        placeholder="Seleccionar ámbitos"
        data={dimensions.map((dim) => ({ value: dim._id, label: dim.name }))}
        onChange={setSelectedDimensions}
        value={selectedDimensions}
        searchable
      />
      )}
      {!hasWorkbookSheets && (
        <>
          <Group justify="space-between" align="flex-end" mb={4}>
            <Text size="sm" fw={500}>Productores</Text>
            <Group gap="xs">
              <Button
                size="compact-xs"
                variant="light"
                color="blue"
                onClick={() => setSelectedDependencies(dependencies.map((d) => d._id))}
                disabled={selectedDependencies.length === dependencies.length}
              >
                Seleccionar todos
              </Button>
              {selectedDependencies.length > 0 && (
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="red"
                  onClick={() => setSelectedDependencies([])}
                >
                  Limpiar
                </Button>
              )}
            </Group>
          </Group>
          <MultiSelect
            mb="xl"
            placeholder="Seleccionar productores"
            data={dependencies?.map((dep) => ({ value: dep._id, label: dep.name }))}
            onChange={(v) => { setSelectedDependencies(v); setHasChanges(true); }}
            value={selectedDependencies}
            searchable
          />
        </>
      )}
      <Switch
        label="Activo"
        checked={active}
        onChange={(event) => setActive(event.currentTarget.checked)}
        mb="sm"
      />
      <Switch
        label="Información visible para otros productores"
        description="Cuando está activo, todos los productores podrán ver (en modo lectura) la información que otros productores hayan cargado en esta plantilla."
        checked={shared}
        onChange={(e) => {
          const checked = e.currentTarget.checked;
          setShared(checked);
        }}
        mb="sm"
      />
      <Switch
        label="Permite generación de código QR"
        description="Cuando está activo, los productores podrán generar un código QR para llenar esta plantilla. También habilita la configuración de campos obligatorios."
        checked={allowsQr}
        onChange={(e) => {
          const checked = e.currentTarget.checked;
          setAllowsQr(checked);
        }}
        mb="md"
      />
      <Divider label="Fechas de la plantilla" labelPosition="left" mb="sm" />
      <Group grow mb="xs">
        <DateInput
          label="Fecha inicial"
          description="Desde cuándo pueden empezar a cargar los productores"
          locale="es"
          placeholder="Seleccionar fecha"
          value={fechaInicio}
          onChange={setFechaInicio}
          clearable
          valueFormat="DD/MM/YYYY"
        />
        <DateInput
          label="Fecha final productores"
          description="Hasta cuándo pueden cargar los productores"
          locale="es"
          placeholder="Seleccionar fecha"
          value={fechaFinalProductores}
          onChange={setFechaFinalProductores}
          minDate={fechaInicio ?? undefined}
          clearable
          valueFormat="DD/MM/YYYY"
        />
      </Group>
      <Group grow mb="md">
        <DateInput
          label="Fecha final productor encargado"
          description="Fecha límite para el productor encargado"
          locale="es"
          placeholder="Seleccionar fecha"
          value={fechaFinalResponsables}
          onChange={setFechaFinalResponsables}
          minDate={fechaFinalProductores ?? fechaInicio ?? undefined}
          clearable
          valueFormat="DD/MM/YYYY"
        />
        <DateInput
          label="Fecha final administradores"
          description="Fecha límite final visible para administradores"
          locale="es"
          placeholder="Seleccionar fecha"
          value={fechaFinal}
          onChange={setFechaFinal}
          minDate={fechaFinalResponsables ?? fechaFinalProductores ?? fechaInicio ?? undefined}
          clearable
          valueFormat="DD/MM/YYYY"
        />
      </Group>
      <Select
        mb="md"
        label="Productor encargado"
        description="Este productor será el encargado del envío final al SNIES. Si no se selecciona ninguno, todos los productores asignados pueden enviar."
        placeholder="Seleccionar productor encargado"
        data={dependencies?.map((dep) => ({ value: dep._id, label: dep.name }))}
        value={responsibleProducers[0] ?? null}
        onChange={(val) => setResponsibleProducers(val ? [val] : [])}
        searchable
        clearable
      />
      {hasWorkbookSheets && (
        <>
          <Text size="sm" c="dimmed" mt="md">
            Hojas de la plantilla:
          </Text>
          <Tabs
            value={activeSheet}
            onChange={(value) => {
              setActiveSheet(value);
            }}
            mt="xs"
            mb="sm"
          >
            <Tabs.List>
              {workbookSheets.map((sheet) => (
                <Tabs.Tab key={sheet.name} value={sheet.name}>
                  {sheet.name}
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs>
          {activeSheet && (
            <>
              <Group justify="space-between" align="flex-end" mb={4}>
                <Text size="sm" fw={500}>Productores para la hoja &quot;{activeSheet}&quot;</Text>
                <Group gap="xs">
                  <Button
                    size="compact-xs"
                    variant="light"
                    color="blue"
                    onClick={() => {
                      const allIds = dependencies.map((d) => d._id);
                      setWorkbookSheets(prev => prev.map(s =>
                        s.name === activeSheet ? { ...s, producers: allIds } : s
                      ));
                    }}
                    disabled={(workbookSheets.find(s => s.name === activeSheet)?.producers || []).length === dependencies.length}
                  >
                    Seleccionar todos
                  </Button>
                  {(workbookSheets.find(s => s.name === activeSheet)?.producers || []).length > 0 && (
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      color="red"
                      onClick={() => {
                        setWorkbookSheets(prev => prev.map(s =>
                          s.name === activeSheet ? { ...s, producers: [] } : s
                        ));
                      }}
                    >
                      Limpiar
                    </Button>
                  )}
                </Group>
              </Group>
              <MultiSelect
                placeholder="Asignar productores a esta hoja"
                data={dependencies?.map((dep) => ({ value: dep._id, label: dep.name }))}
                value={workbookSheets.find(s => s.name === activeSheet)?.producers || []}
                onChange={(values) => {
                  setWorkbookSheets(prev => prev.map(s =>
                    s.name === activeSheet ? { ...s, producers: values } : s
                  ));
                }}
                searchable
                mb="xs"
              />
            </>
          )}
        </>
      )}

      {baseFields.length > 0 && (
        <Box mt="sm" mb="sm" style={{ borderRadius: "var(--mantine-radius-md)", border: "1px solid var(--mantine-color-gray-3)", overflow: "hidden" }}>
          {/* Encabezado */}
          <Group
            justify="space-between"
            px="sm"
            py={8}
            style={{ background: "var(--mantine-color-gray-1)", borderBottom: "1px solid var(--mantine-color-gray-3)" }}
          >
            <Text size="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: "0.05em" }}>
              Campos base
            </Text>
            {allowsQr && (
              <Group gap="xs" align="center">
                <Button
                  size="compact-xs"
                  variant="subtle"
                  color="blue"
                  onClick={() => {
                    const allRequired = baseFields.every(f => f.required);
                    baseFields.forEach(f => toggleBaseFieldRequired(f.name, !allRequired));
                  }}
                >
                  {baseFields.every(f => f.required) ? "Desmarcar todos" : "Marcar todos"}
                </Button>
                <Text size="xs" fw={700} tt="uppercase" c="dimmed" style={{ letterSpacing: "0.05em" }}>
                  ¿Obligatorio?
                </Text>
              </Group>
            )}
          </Group>
          {/* Filas */}
          {baseFields.map((field, i) => (
            <Group
              key={i}
              justify="space-between"
              align="center"
              px="sm"
              py={7}
              style={{
                background: i % 2 === 0 ? "white" : "var(--mantine-color-gray-0)",
                borderBottom: i < baseFields.length - 1 ? "1px solid var(--mantine-color-gray-2)" : "none",
                transition: "background 0.15s",
              }}
            >
              <Group gap="xs" align="center">
                <Text
                  size="xs"
                  fw={500}
                  style={{
                    minWidth: 22,
                    textAlign: "right",
                    color: "var(--mantine-color-gray-5)",
                  }}
                >
                  {i + 1}.
                </Text>
                <Text
                  size="sm"
                  fw={allowsQr && field.required ? 600 : 400}
                  c={allowsQr && field.required ? "dark" : "dimmed"}
                >
                  {field.name}
                </Text>
              </Group>
              {allowsQr && (
                <Tooltip label={field.required ? "Obligatorio" : "Opcional"} withArrow position="left">
                  <Checkbox
                    size="sm"
                    checked={field.required}
                    color={field.required ? "blue" : "gray"}
                    onChange={(e) => toggleBaseFieldRequired(field.name, e.currentTarget.checked)}
                    aria-label={`${field.name} obligatorio`}
                  />
                </Tooltip>
              )}
            </Group>
          ))}
        </Box>
      )}

      <DragDropContext onDragEnd={onDragEnd}>
        <Droppable droppableId="fields">
          {(provided) => (
            <Table stickyHeader withTableBorder {...provided.droppableProps} ref={provided.innerRef}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Arrastrar</Table.Th>
                  <Table.Th>Nombre Campo</Table.Th>
                  <Table.Th>Tipo de Campo</Table.Th>
                  <Table.Th>¿Obligatorio?</Table.Th>
                  <Table.Th>Validar con Base de Datos</Table.Th>
                  <Table.Th w={rem(70)}>Múltiple Respuesta</Table.Th>
                  <Table.Th>Comentario del Campo / Pista</Table.Th>
                  <Table.Th>Acciones</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {editableFields.map((field, editableIndex) => {
                  const actualIndex = displayedFields.indexOf(field);
                  return (
                  <Draggable
                    key={`${activeSheetData?.name || "default"}-${actualIndex}`}
                    draggableId={`field-${activeSheetData?.name || "default"}-${actualIndex}`}
                    index={editableIndex}
                  >
                    {(provided) => (
                      <Table.Tr
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                      >
                        <Table.Td {...provided.dragHandleProps}>
                          <Center>
                            <IconGripVertical size={18} />
                          </Center>
                        </Table.Td>
                        <Table.Td>
                          <TextInput
                            placeholder="Nombre del campo"
                            value={field.name}
                            onChange={(event) => handleDisplayedFieldChange(actualIndex, "name", event.currentTarget.value)}
                          />
                        </Table.Td>
                        <Table.Td w={rem(160)}>
                          <Select
                            placeholder="Seleccionar"
                            data={allowedDataTypes}
                            value={field.datatype}
                            onChange={(value) => handleDisplayedFieldChange(actualIndex, "datatype", value || "")}
                            readOnly={!!field.validate_with}
                          />
                        </Table.Td>
                        <Table.Td>
                          <Center>
                            <Checkbox
                              label=""
                              checked={field.required}
                              onChange={(event) => handleDisplayedFieldChange(actualIndex, "required", event.currentTarget.checked)}
                            />
                          </Center>
                        </Table.Td>
                        <Table.Td>
                          <Select
                            placeholder="Validar con"
                            data={validatorOptions.map(option => ({ value: option.name, label: option.name }))}
                            value={field.validate_with}
                            onChange={(value) => handleDisplayedFieldChange(actualIndex, "validate_with", value || "")}
                            maxDropdownHeight={200}
                            searchable
                            clearable
                            nothingFoundMessage="La validación no existe"
                          />
                        </Table.Td>
                        <Table.Td>
                          <Center>
                            <Tooltip
                              label="Esta opción solo se puede activar si se selecciona una validación"
                              position="top"
                              withArrow
                              transitionProps={{ transition: "slide-up", duration: 300 }}
                              disabled={field.validate_with !== ""}
                            >
                              <Checkbox
                                label=""
                                checked={field.multiple}
                                onChange={(event) => handleDisplayedFieldChange(actualIndex, "multiple", event.currentTarget.checked)}
                                disabled={!field.validate_with}
                              />
                            </Tooltip>
                          </Center>
                        </Table.Td>
                        <Table.Td>
                          <Textarea
                            placeholder="Comentario del Campo / Pista"
                            value={field.comment}
                            onChange={(event) =>
                              handleDisplayedFieldChange(actualIndex, "comment", event.currentTarget.value)
                            }
                            autosize
                            minRows={1}
                          />
                        </Table.Td>
                        <Table.Td>
                          <Button color="red" onClick={() => removeDisplayedField(actualIndex)}>
                            Eliminar
                          </Button>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Draggable>
                  );
                })}
                {provided.placeholder}
              </Table.Tbody>
              <Table.Tfoot>
                <Table.Tr style={{ background: "var(--mantine-color-blue-light)", borderTop: "2px dashed var(--mantine-color-blue-3)" }}>
                  <Table.Td>
                    <Center>
                      <IconCirclePlus size={18} color="var(--mantine-color-blue-filled)" />
                    </Center>
                  </Table.Td>
                  <Table.Td>
                    <TextInput
                      placeholder="Nombre del campo"
                      value={newField.name}
                      onChange={(e) => setNewField({ ...newField, name: e.currentTarget.value })}
                    />
                  </Table.Td>
                  <Table.Td w={rem(160)}>
                    <Select
                      placeholder="Tipo"
                      data={allowedDataTypes}
                      value={newField.datatype || null}
                      onChange={(v) => setNewField({ ...newField, datatype: v || "" })}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Center>
                      <Checkbox
                        checked={newField.required}
                        onChange={(e) => setNewField({ ...newField, required: e.currentTarget.checked })}
                      />
                    </Center>
                  </Table.Td>
                  <Table.Td>
                    <Select
                      placeholder="Validar con"
                      data={validatorOptions.map((o) => ({ value: o.name, label: o.name }))}
                      value={newField.validate_with || null}
                      onChange={(v) => setNewField({ ...newField, validate_with: v || "" })}
                      searchable
                      clearable
                      maxDropdownHeight={200}
                      nothingFoundMessage="No existe"
                    />
                  </Table.Td>
                  <Table.Td>
                    <Center>
                      <Tooltip
                        label="Solo disponible si seleccionas una validación"
                        disabled={!!newField.validate_with}
                        withArrow
                      >
                        <Checkbox
                          checked={newField.multiple}
                          onChange={(e) => setNewField({ ...newField, multiple: e.currentTarget.checked })}
                          disabled={!newField.validate_with}
                        />
                      </Tooltip>
                    </Center>
                  </Table.Td>
                  <Table.Td>
                    <Textarea
                      placeholder="Comentario / Pista"
                      value={newField.comment}
                      onChange={(e) => setNewField({ ...newField, comment: e.currentTarget.value })}
                      autosize
                      minRows={1}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Button
                      color="blue"
                      size="xs"
                      onClick={addDisplayedField}
                      leftSection={<IconCirclePlus size={14} />}
                    >
                      Añadir
                    </Button>
                  </Table.Td>
                </Table.Tr>
              </Table.Tfoot>
            </Table>
          )}
        </Droppable>
      </DragDropContext>
      <Group mt="md">
        <Button onClick={handleSave} leftSection={<IconDeviceFloppy />}>Guardar</Button>
        <Button variant="outline" onClick={handleDownloadTemplate} leftSection={<IconDownload />}>
          Descargar Plantilla Actualizada
        </Button>
        <Button variant="outline" onClick={() => confirmNavigation(() => router.back())}>
          Cancelar
        </Button>
      </Group>
    </Container>
  );
};

export default UpdateTemplatePage;
