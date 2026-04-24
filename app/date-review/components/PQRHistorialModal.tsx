"use client";

import { Modal } from "@mantine/core";
import PQRHistorialView from "./PQRHistorialView";
import type { PQR, Program } from "../types";

interface Props {
  opened: boolean;
  onClose: () => void;
  pqrs: PQR[];
  programas: Program[];
}

/** @deprecated Prefer módulo Comunicaciones MEN en date-review (vista embebida). */
export default function PQRHistorialModal({ opened, onClose, pqrs, programas }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="Historial de PQR" size="95vw" radius="md" centered
      styles={{ body: { padding: "12px 16px" } }}>
      <PQRHistorialView pqrs={pqrs} programas={programas} />
    </Modal>
  );
}
