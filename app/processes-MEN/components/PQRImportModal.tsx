"use client";

import { Fragment, useState } from "react";
import { Alert, Badge, Button, Checkbox, FileInput, Group, Modal, ScrollArea, Select, Stack, Table, Text } from "@mantine/core";
import axios from "axios";
import type { PQR, Program } from "../types";
import PQRImportDetails from "./PQRImportDetails";

type ImportRow = { key: string; hoja: string; filas: number[]; data: Partial<PQR>; warnings: string[]; errors: string[]; accion: "crear" | "existente" | "error" };
type Preview = { totalFilas: number; hojasIgnoradas: string[]; rows: ImportRow[] };
type Result = { creados: number; omitidos: number; errores: { filas: number[]; error: string }[]; pqrs: PQR[] };

export default function PQRImportModal({ opened, onClose, onImported, programas }: {
  opened: boolean; onClose: () => void; onImported: (pqrs: PQR[]) => void; programas: Program[];
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [programs, setPrograms] = useState<Record<string, string | null>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const available = preview?.rows.filter(row => row.accion === "crear").map(row => row.key) || [];
  const programOptions = programas.map(program => ({ value: program._id, label: `${program.nombre} (${program.dep_code_programa || program.dep_code_facultad})` }));

  const readFile = async (commit: boolean) => {
    if (!file || busy) return;
    if (!/\.xlsx$/i.test(file.name) || file.size > 5 * 1024 * 1024) { setError("Selecciona un archivo .xlsx de hasta 5 MB."); return; }
    setBusy(true);
    setError(null);
    const body = new FormData();
    body.append("file", file);
    if (commit) body.append("seleccion", JSON.stringify(selected.map(key => ({ key, programa_id: programs[key] || null }))));
    try {
      if (commit) {
        const response = await axios.post<Result>(`${process.env.NEXT_PUBLIC_API_URL}/pqr/importar`, body);
        setResult(response.data);
        setPreview(null);
        setSelected([]);
        onImported(response.data.pqrs);
      } else {
        const response = await axios.post<Preview>(`${process.env.NEXT_PUBLIC_API_URL}/pqr/importar/preview`, body);
        setPreview(response.data);
        setResult(null);
        setSelected(response.data.rows.filter(row => row.accion === "crear").map(row => row.key));
        setPrograms({});
      }
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.error || "No se pudo conectar con el servidor. Puedes reintentar; las coincidencias se omiten." : "No se pudo procesar el archivo.");
    } finally { setBusy(false); }
  };

  return <Modal opened={opened} onClose={() => { if (!busy) onClose(); }} title="Importar PQR desde Excel" size="min(1200px, 95vw)" centered zIndex={300} closeOnClickOutside={!busy} closeOnEscape={!busy} withCloseButton={!busy}>
    <Stack gap="md">
      <Text size="sm">Se reconocen las columnas del formato PQR MEN. Revisa los datos antes de guardar. Los PQR existentes se omiten y los nuevos quedan activos, aunque tengan respuesta.</Text>
      <FileInput label="Archivo Excel (.xlsx, máximo 5 MB)" placeholder="Seleccionar archivo" accept=".xlsx" value={file} disabled={busy} clearable onChange={value => {
        setFile(value); setPreview(null); setResult(null); setError(null); setSelected([]); setExpanded(null); setPrograms({});
      }} />
      <Group><Button variant="light" disabled={!file || busy} loading={busy && !preview} onClick={() => void readFile(false)}>Revisar archivo</Button></Group>
      {error && <Alert color="red" title="No se completó la operación">{error}</Alert>}
      {result && <Alert color={result.errores.length ? "orange" : "teal"} title="Resultado de la importación">
        <Text size="sm">{result.creados} PQR creados · {result.omitidos} existentes omitidos · {result.errores.length} con error.</Text>
        {result.errores.map((item, index) => <Text key={index} size="sm">Filas {item.filas.join(", ")}: {item.error}</Text>)}
        {!!result.errores.length && <Text size="sm">Revisa el archivo y pulsa Revisar archivo para reintentar los pendientes.</Text>}
      </Alert>}
      {preview && <>
        <Group gap="xs"><Badge>{preview.totalFilas} filas</Badge><Badge color="teal">{available.length} nuevos</Badge><Badge color="gray">{preview.rows.filter(row => row.accion === "existente").length} existentes</Badge><Badge color="red">{preview.rows.filter(row => row.accion === "error").length} con error</Badge></Group>
        {!!preview.hojasIgnoradas.length && <Alert color="orange">Hojas sin columnas PQR, no importadas: {preview.hojasIgnoradas.join(", ")}</Alert>}
        <Text size="sm" c="dimmed">Las filas repetidas se agrupan por radicado. Si corresponde, selecciona un programa en cada PQR; el Excel no incluye una columna de programa. Sin selección se guarda como MEN directo.</Text>
        <Checkbox label={`Seleccionar todos los nuevos (${available.length})`} disabled={busy || !available.length} checked={!!available.length && selected.length === available.length} indeterminate={selected.length > 0 && selected.length < available.length} onChange={event => setSelected(event.currentTarget.checked ? available : [])} />
        <ScrollArea.Autosize mah="50vh" type="auto">
          <Table withTableBorder withColumnBorders style={{ minWidth: 850 }}>
            <Table.Thead><Table.Tr><Table.Th>Importar</Table.Th><Table.Th>Solicitud / radicado</Table.Th><Table.Th>Fechas</Table.Th><Table.Th>Programa</Table.Th><Table.Th>Revisión</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>{preview.rows.map(row => <Fragment key={row.key}>
              <Table.Tr>
                <Table.Td><Checkbox aria-label={`Importar filas ${row.filas.join(", ")}`} disabled={busy || row.accion !== "crear"} checked={selected.includes(row.key)} onChange={event => setSelected(event.currentTarget.checked ? [...selected, row.key] : selected.filter(key => key !== row.key))} /><Text size="xs" mt={4}>Fila {row.filas.join(", ")}</Text></Table.Td>
                <Table.Td maw={330}><Text size="sm" lineClamp={3}>{row.data.nombre_solicitud || "Sin solicitud"}</Text><Text size="xs" fw={600} style={{ whiteSpace: "pre-wrap" }}>{row.data.numero_radicado || "Sin radicado"}</Text></Table.Td>
                <Table.Td><Text size="xs">Rad.: {row.data.fecha_radicacion || "Sin fecha"}</Text><Text size="xs">Resp.: {row.data.fecha_respuesta || "Sin fecha"}</Text></Table.Td>
                <Table.Td miw={210}><Select aria-label={`Programa para filas ${row.filas.join(", ")}`} placeholder="MEN directo" searchable clearable data={programOptions} value={programs[row.key] || null} disabled={busy || row.accion !== "crear"} onChange={value => setPrograms(previous => ({ ...previous, [row.key]: value }))} comboboxProps={{ withinPortal: true, zIndex: 400 }} /></Table.Td>
                <Table.Td><Stack gap={4}><Badge color={row.accion === "crear" ? "teal" : row.accion === "error" ? "red" : "gray"}>{row.accion === "crear" ? "Nuevo" : row.accion === "error" ? "Corregir Excel" : "Se omite"}</Badge>{!!row.warnings.length && <Text size="xs" c="orange">{row.warnings.length} avisos</Text>}<Button size="xs" variant="subtle" onClick={() => setExpanded(expanded === row.key ? null : row.key)}>{expanded === row.key ? "Ocultar" : "Ver datos"}</Button></Stack></Table.Td>
              </Table.Tr>
              {expanded === row.key && <Table.Tr><Table.Td colSpan={5}><Stack p="sm">
                {row.errors.map((message, i) => <Alert key={i} color="red">{message}</Alert>)}
                {row.warnings.map((message, i) => <Alert key={i} color="orange">{message}</Alert>)}
                <PQRImportDetails pqr={row.data} />
              </Stack></Table.Td></Table.Tr>}
            </Fragment>)}</Table.Tbody>
          </Table>
        </ScrollArea.Autosize>
      </>}
      <Group justify="flex-end"><Button variant="default" disabled={busy} onClick={onClose}>Cerrar</Button>{preview && <Button disabled={!selected.length || busy} loading={busy} onClick={() => void readFile(true)}>Importar {selected.length} PQR</Button>}</Group>
    </Stack>
  </Modal>;
}
