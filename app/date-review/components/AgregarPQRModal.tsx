"use client";

import { Modal } from "@mantine/core";
import PQRAgregarForm from "./PQRAgregarForm";
import type { Program, PQR } from "../types";

interface Props {
  opened: boolean;
  onClose: () => void;
  programas: Program[];
  onCreado: (pqr: PQR) => void;
}

export default function AgregarPQRModal({ opened, onClose, programas, onCreado }: Props) {
  return (
    <Modal opened={opened} onClose={onClose} title="Agregar PQR" centered size="md" radius="md">
      <PQRAgregarForm
        programas={programas}
        onCreado={(p) => { onCreado(p); onClose(); }}
        onCancel={onClose}
      />
    </Modal>
  );
}
