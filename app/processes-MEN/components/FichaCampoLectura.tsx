"use client";

import { Paper, Text } from "@mantine/core";
import type { ReactNode } from "react";

const valorTextoStyle = {
  overflowWrap: "anywhere" as const,
  wordBreak: "break-word" as const,
  whiteSpace: "pre-wrap" as const,
};

export function formatFichaValor(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return String(value);
  return String(value);
}

type FichaCampoLecturaProps = {
  label: string;
  value: unknown;
};

/** Cuadro compacto de solo lectura (misma altura mínima que el resto de la ficha). */
export function FichaCampoLectura({ label, value }: FichaCampoLecturaProps) {
  return (
    <Paper withBorder radius="sm" p="sm" style={{ minHeight: 72 }}>
      <Text size="xs" c="dimmed" mb={2}>
        {label}
      </Text>
      <Text size="sm" fw={600} style={valorTextoStyle}>
        {formatFichaValor(value)}
      </Text>
    </Paper>
  );
}

type FichaCampoLecturaNodeProps = {
  label: string;
  children: ReactNode;
};

export function FichaCampoLecturaNode({ label, children }: FichaCampoLecturaNodeProps) {
  return (
    <Paper withBorder radius="sm" p="sm" style={{ minHeight: 72 }}>
      <Text size="xs" c="dimmed" mb={2}>
        {label}
      </Text>
      {children}
    </Paper>
  );
}
