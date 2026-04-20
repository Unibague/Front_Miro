"use client";

import { useState } from "react";
import { Paper, Text, Group, Tooltip, Modal, Stack, Anchor } from "@mantine/core";
import { useRouter } from "next/navigation";
import { faseColors } from "../constants";
import type { BarRow, Program, Process } from "../types";

type BarTableProps = {
  title: string;
  data: BarRow[];
  tipoProceso: "RC" | "AV";
  programas: Program[];
  procesos: Process[];
  onOpenPrograms?: (programs: Program[]) => void;
};

function segmentIndexToFaseActual(seg: number): { min: number; max: number } {
  if (seg === 7) return { min: 7, max: 99 };
  return { min: seg, max: seg };
}

function programsInSegment(
  depCode: string,
  segmentIndex: number,
  tipo: "RC" | "AV",
  programas: Program[],
  procesos: Process[]
): Program[] {
  const { min, max } = segmentIndexToFaseActual(segmentIndex);
  return programas.filter((p) => {
    if (p.dep_code_facultad !== depCode) return false;
    const proc = procesos.find((x) => x.program_code === p.dep_code_programa && x.tipo_proceso === tipo);
    if (!proc) return false;
    const n = Number(proc.fase_actual) || 0;
    if (segmentIndex === 7) return n >= 7;
    return n === min;
  });
}

const StackedBar = ({
  row,
  tipoProceso,
  programas,
  procesos,
  onSegment,
}: {
  row: BarRow;
  tipoProceso: "RC" | "AV";
  programas: Program[];
  procesos: Process[];
  onSegment: (programs: Program[], facultyName: string, segmentIndex: number) => void;
}) => {
  const vals = [
    row.fase_0, row.fase_1, row.fase_2, row.fase_3, row.fase_4, row.fase_5, row.fase_6,
    row.fase_contingencia,
  ];
  const total = vals.reduce((a, b) => a + b, 0);
  if (total === 0) {
    return (
      <div style={{ height: 28, borderRadius: 6, background: "#f1f3f5" }} />
    );
  }
  return (
    <div style={{ display: "flex", height: "28px", borderRadius: "6px", overflow: "hidden", width: "100%" }}>
      {vals.map((v, i) =>
        v > 0 ? (
          <button
            key={i}
            type="button"
            title="Ver programas en esta fase"
            onClick={() =>
              onSegment(
                programsInSegment(row.dep_code, i, tipoProceso, programas, procesos),
                row.nombre,
                i
              )
            }
            style={{
              width: `${(v / total) * 100}%`,
              backgroundColor: faseColors[i]?.color ?? "#ced4da",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "12px",
              fontWeight: 600,
              color: "#333",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            {v}
          </button>
        ) : null
      )}
    </div>
  );
};

type ModalCtx = { programs: Program[]; facultyName: string; segmentIndex: number };

const BarTable = ({ title, data, tipoProceso, programas, procesos }: BarTableProps) => {
  const router = useRouter();
  const [modalCtx, setModalCtx] = useState<ModalCtx | null>(null);

  const tipoLabel = tipoProceso === "RC" ? "Registro calificado" : "Acreditación voluntaria";

  return (
    <>
      <Paper withBorder radius="md" p="md" mb="lg">
        <Text fw={700} ta="center" mb="md" size="sm">{title}</Text>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {data.length === 0 ? (
            <Text ta="center" c="dimmed" size="sm">Sin datos para el filtro seleccionado</Text>
          ) : (
            data.map((row, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <Text size="xs" style={{ width: "160px", flexShrink: 0 }}>{row.nombre}:</Text>
                <div style={{ flex: 1 }}>
                  <StackedBar
                    row={row}
                    tipoProceso={tipoProceso}
                    programas={programas}
                    procesos={procesos}
                    onSegment={(progs, facultyName, segmentIndex) =>
                      setModalCtx({ programs: progs, facultyName, segmentIndex })
                    }
                  />
                </div>
              </div>
            ))
          )}
        </div>
        <Group gap="md" mt="md" justify="center" wrap="wrap">
          {faseColors.map((f) => (
            <Tooltip key={f.fase} label={f.fullName} withArrow>
              <Group gap={4}>
                <div style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: f.color }} />
                <Text size="xs">{f.label}</Text>
              </Group>
            </Tooltip>
          ))}
        </Group>
      </Paper>

      <Modal
        opened={modalCtx !== null}
        onClose={() => setModalCtx(null)}
        title={
          modalCtx ? (
            <Stack gap={2}>
              <Text fw={700} size="sm">Programas en esta fase</Text>
              <Text size="xs" c="dimmed">
                <Text span fw={600} c="dark">{modalCtx.facultyName}</Text>
                {" · "}
                {faseColors[modalCtx.segmentIndex]?.fullName ?? `Segmento ${modalCtx.segmentIndex}`}
                {" · "}
                {tipoLabel}
              </Text>
            </Stack>
          ) : (
            "Programas en esta fase"
          )
        }
        centered radius="md"
      >
        {modalCtx?.programs && modalCtx.programs.length === 0 ? (
          <Text size="sm" c="dimmed">No hay programas (datos desactualizados).</Text>
        ) : (
          <Stack gap="xs">
            {modalCtx?.programs.map((p) => (
              <Anchor
                key={p._id}
                size="sm"
                fw={600}
                onClick={() => {
                  setModalCtx(null);
                  router.push(`/date-review/program/${p._id}`);
                }}
                style={{ cursor: "pointer" }}
              >
                {p.nombre}
                {p.codigo_snies ? ` · SNIES ${p.codigo_snies}` : ""}
              </Anchor>
            ))}
          </Stack>
        )}
      </Modal>
    </>
  );
};

export default BarTable;
