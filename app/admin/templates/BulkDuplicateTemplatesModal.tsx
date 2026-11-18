"use client";

import { useEffect, useRef, useState } from "react";
import { Alert, Badge, Button, Checkbox, Group, Loader, Modal, Progress, ScrollArea, Select, Stack, Text, TextInput } from "@mantine/core";
import { IconCopy } from "@tabler/icons-react";
import axios from "axios";

type TemplateOption = { _id: string; name: string };
type PeriodOption = { _id: string; name: string };
type CopyResult = { id: string; name: string; success: boolean; message?: string };

export default function BulkDuplicateTemplatesModal({ sourcePeriodId, periods, email, onClose, onDuplicated }: {
  sourcePeriodId: string;
  periods: PeriodOption[];
  email: string;
  onClose: () => void;
  onDuplicated: () => void;
}) {
  // Mantener el período de origen durante toda la operación.
  const [origin] = useState(sourcePeriodId);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [targetPeriodId, setTargetPeriodId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [results, setResults] = useState<CopyResult[]>([]);
  const [resultPeriodName, setResultPeriodName] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    axios.get(`${process.env.NEXT_PUBLIC_API_URL}/templates/all/no-pagination`, {
      params: { minimal: true, periodId: origin, onlyPublishedInPeriod: true },
      signal: controller.signal,
    }).then(({ data }) => {
      setTemplates(data.templates || []);
    }).catch((error) => {
      if (!axios.isCancel(error)) setLoadError("No se pudieron cargar las plantillas. Cierra esta ventana e intenta de nuevo.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [origin]);

  const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const visible = templates.filter((template) => normalize(template.name).includes(normalize(search.trim())));
  const allVisibleSelected = visible.length > 0 && visible.every((template) => selected.includes(template._id));
  const someVisibleSelected = visible.some((template) => selected.includes(template._id));
  const successes = results.filter((result) => result.success);
  const failures = results.filter((result) => !result.success);

  const duplicate = async () => {
    if (running.current || !targetPeriodId || !email || !selected.length) return;
    running.current = true;
    setBusy(true);
    setResults([]);
    setResultPeriodName(periods.find((period) => period._id === targetPeriodId)?.name || "el período destino");
    const chosen = templates.filter((template) => selected.includes(template._id));
    setProgress({ completed: 0, total: chosen.length });
    try {
      // Procesar en orden para no sobrecargar la copia y publicación de archivos.
      for (const template of chosen) {
        let result: CopyResult;
        try {
          await axios.post(`${process.env.NEXT_PUBLIC_API_URL}/templates/duplicate`, {
            id: template._id, targetPeriodId, email, sourcePeriodId: origin,
          });
          result = { id: template._id, name: template.name, success: true };
          // Un nuevo intento solo incluye las que aún no se han duplicado.
          setSelected((current) => current.filter((id) => id !== template._id));
        } catch (error) {
          const data = axios.isAxiosError(error) ? error.response?.data : null;
          result = {
            id: template._id, name: template.name, success: false,
            message: data?.mensaje || data?.error || "No se pudo confirmar la copia. Revisa el período destino antes de volver a intentar.",
          };
        }
        setResults((current) => [...current, result]);
        setProgress((current) => ({ ...current, completed: current.completed + 1 }));
      }
      onDuplicated();
    } finally {
      running.current = false;
      setBusy(false);
    }
  };

  return (
    <Modal opened onClose={() => { if (!running.current) onClose(); }} title="Duplicar plantillas masivas" centered size="lg"
      closeOnClickOutside={!busy} closeOnEscape={!busy} withCloseButton={!busy}>
      <Stack gap="md">
        <Text size="sm">Selecciona las plantillas de {periods.find((period) => period._id === origin)?.name || "este período"} y el período donde quieres crear las copias. Se conserva su configuración y se publican como en la duplicación individual.</Text>
        <Select label="Período destino" placeholder="Seleccionar período" searchable
          data={periods.filter((period) => period._id !== origin).map((period) => ({ value: period._id, label: period.name }))}
          value={targetPeriodId} onChange={setTargetPeriodId} disabled={busy} />
        <Text size="xs" c="dimmed">También se copian los validadores del período de origen. Si ya existen en el destino, se reutilizan sin modificar sus datos.</Text>
        {loadError ? <Alert color="red">{loadError}</Alert> : loading ? <Group><Loader size="sm" /><Text size="sm">Cargando plantillas…</Text></Group> : (
          <>
            <TextInput label="Buscar plantillas" placeholder="Nombre de la plantilla" value={search}
              onChange={(event) => setSearch(event.currentTarget.value)} disabled={busy} />
            <Group justify="space-between">
              <Checkbox label="Seleccionar todas las visibles" checked={allVisibleSelected}
                indeterminate={!allVisibleSelected && someVisibleSelected} disabled={busy || !visible.length}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  const ids = new Set(visible.map((template) => template._id));
                  setSelected((current) => checked ? Array.from(new Set([...current, ...ids])) : current.filter((id) => !ids.has(id)));
                }} />
              <Badge variant="light" tt="none">{selected.length} seleccionadas</Badge>
            </Group>
            <ScrollArea.Autosize mah={300} offsetScrollbars>
              <Stack gap="xs" p={4}>
                {!visible.length && <Text size="sm" c="dimmed">{templates.length ? "No hay coincidencias." : "No hay plantillas en este período."}</Text>}
                {visible.map((template) => (
                  <Checkbox key={template._id} label={template.name} checked={selected.includes(template._id)} disabled={busy}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setSelected((current) => checked ? [...current, template._id] : current.filter((id) => id !== template._id));
                    }} />
                ))}
              </Stack>
            </ScrollArea.Autosize>
          </>
        )}
        {progress.total > 0 && (
          <Stack gap={6} aria-live="polite">
            <Text size="sm">{busy ? "Duplicando" : "Procesadas"}: {progress.completed} de {progress.total}</Text>
            <Progress value={progress.completed / progress.total * 100} animated={busy} />
          </Stack>
        )}
        {!busy && results.length > 0 && (
          <Alert color={failures.length ? "orange" : "teal"} title="Resultado de la duplicación">
            <Text size="sm">{successes.length} duplicadas · {failures.length} con error.</Text>
            {successes.length > 0 && <Text size="sm" mt={4}>Copias creadas en {resultPeriodName}.</Text>}
            {failures.map((result) => <Text size="sm" key={result.id} mt={4}>{result.name}: {result.message}</Text>)}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={busy}>Cerrar</Button>
          <Button leftSection={<IconCopy size={16} />} loading={busy}
            disabled={loading || !!loadError || !selected.length || !targetPeriodId || !email} onClick={duplicate}>
            Duplicar {selected.length > 0 ? `${selected.length} plantillas` : "seleccionadas"}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
