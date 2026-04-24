"use client";

import { Modal } from "@mantine/core";
import PQRActivosView from "./PQRActivosView";
import type { PQR, Program } from "../types";

interface Props {
  opened: boolean;
  onClose: () => void;
  pqrs: PQR[];
  programas: Program[];
  onUpdate: (updated: PQR) => void;
  onCerrar: (id: string) => void;
}

/** @deprecated Prefer módulo Comunicaciones MEN en date-review (vista embebida). */
export default function PQRListModal({ opened, onClose, pqrs, programas, onUpdate, onCerrar }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="PQR activos" size="95vw" radius="md" centered
      styles={{ body: { padding: "12px 16px" } }}>
      <PQRActivosView pqrs={pqrs} programas={programas} onUpdate={onUpdate} onCerrar={onCerrar} />
    </Modal>
  );
}
