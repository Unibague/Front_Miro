"use client";

import { Accordion, Anchor, Stack, Text } from "@mantine/core";
import type { PQR } from "../types";

const labels: Record<string, string> = {
  nombre_solicitud: "Solicitud", fecha_radicacion: "Fecha de radicación", hora: "Hora",
  numero_radicado: "Número de radicado", medio_realizado: "Medio", fecha_respuesta: "Fecha de respuesta",
  observacion_respuesta: "Observación / Respuesta", cedula_encargado: "Cédula del encargado", enlaces_respuesta: "Link Respuesta",
};

export default function PQRImportDetails({ pqr }: { pqr: Partial<PQR> }) {
  return <Stack gap="sm">
    {Object.entries(labels).filter(([field]) => field !== "enlaces_respuesta").map(([field, label]) => (
      <div key={field}>
        <Text size="xs" fw={600}>{label}</Text>
        <Text size="sm" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{String(pqr[field as keyof PQR] || "Sin dato")}</Text>
      </div>
    ))}
    {(pqr.enlaces_respuesta || []).map((link, index) => (
      /^https?:\/\//i.test(link.url)
        ? <Anchor key={index} href={link.url} target="_blank" rel="noopener noreferrer" size="sm">{link.nombre || "Documento de respuesta"}</Anchor>
        : <div key={index}><Text size="sm" fw={500}>{link.nombre}</Text><Text size="xs" c="orange">Referencia local: adjunta el archivo desde Documentos del PQR.</Text><Text size="xs" style={{ overflowWrap: "anywhere" }}>{link.url}</Text></div>
    ))}
    {!!pqr.importacion_fuentes?.length && <Accordion variant="contained">
      <Accordion.Item value="original"><Accordion.Control>Datos originales del Excel</Accordion.Control>
        <Accordion.Panel><Stack gap="md">{pqr.importacion_fuentes.map((source, index) => (
          <div key={index}>
            <Text size="sm" fw={700}>{source.hoja} · Fila {source.fila}</Text>
            {Object.entries(source.valores).filter(([, value]) => value).map(([field, value]) => (
              <Text key={field} size="xs" style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}><strong>{labels[field] || field}:</strong> {value}</Text>
            ))}
          </div>
        ))}</Stack></Accordion.Panel>
      </Accordion.Item>
    </Accordion>}
  </Stack>;
}
