import { Dropzone } from "@mantine/dropzone";
import { Group, Progress, Stack, Text, ThemeIcon, Badge } from "@mantine/core";
import { IconCloudUpload, IconCheck, IconX, IconPaperclip } from "@tabler/icons-react";
import classes from "./DropzoneCustom.module.css"

interface DropzoneComponentProps {
  onDrop: (files: File[]) => void;
  text: string;
  loading?: boolean;
}

/** Zona para subir archivos: arrastrar y soltar o clic para buscar. */
const DropzoneCustomComponent = ({ onDrop, text, loading = false }: DropzoneComponentProps) => {
  return (
    <Dropzone
      disabled={loading}
      onDrop={(files) => {
        onDrop(files); // Usar la función onDrop pasada por props
      }}
      className={`${classes.dropzone} ${loading ? classes.loading : ""}`}
      radius="lg"
      aria-busy={loading}
    >
      <Stack align="center" gap={6} style={{ pointerEvents: "none" }}>
        <Dropzone.Accept>
          <ThemeIcon size={56} radius="xl" variant="light" color="teal">
            <IconCheck size={28} stroke={1.8} />
          </ThemeIcon>
        </Dropzone.Accept>
        <Dropzone.Reject>
          <ThemeIcon size={56} radius="xl" variant="light" color="red">
            <IconX size={28} stroke={1.8} />
          </ThemeIcon>
        </Dropzone.Reject>
        <Dropzone.Idle>
          <ThemeIcon size={56} radius="xl" variant="white" color="blue" className={classes.icon}>
            <IconCloudUpload size={28} stroke={1.6} />
          </ThemeIcon>
        </Dropzone.Idle>

        <Dropzone.Accept>
          <Text fw={700} c="teal.7">Suelta el archivo para subirlo</Text>
        </Dropzone.Accept>
        <Dropzone.Reject>
          <Text fw={700} c="red.7">Este archivo no se puede subir</Text>
        </Dropzone.Reject>
        <Dropzone.Idle>
          <Text fw={700}>{loading ? "Subiendo archivo…" : "Arrastra tu archivo aquí"}</Text>
        </Dropzone.Idle>

        <Text ta="center" fz="sm" c="dimmed" maw={420}>
          {text}
        </Text>

        {!loading && (
          <Group gap={6} mt={4}>
            <Badge size="lg" radius="xl" variant="filled" color="blue" tt="none" leftSection={<IconPaperclip size={14} />}>
              Seleccionar archivo
            </Badge>
          </Group>
        )}
      </Stack>
      {loading && <Progress className={classes.progress} value={100} animated radius="xl" aria-label="Carga en curso" />}
    </Dropzone>
  );
};

export default DropzoneCustomComponent;
