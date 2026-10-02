import { Dropzone } from "@mantine/dropzone";
import { Group, Progress, Text } from "@mantine/core";
import { IconCloudUpload, IconDownload, IconX } from "@tabler/icons-react";
import { rem } from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import { useMantineTheme } from "@mantine/core";
import classes from "./DropzoneCustom.module.css"

interface DropzoneComponentProps {
  onDrop: (files: File[]) => void;
  text: string;
  loading?: boolean;
}

const DropzoneCustomComponent = ({ onDrop, text, loading = false }: DropzoneComponentProps) => {
  const theme = useMantineTheme();

  return (
    <Dropzone
      disabled={loading}
      onDrop={(files) => {
        onDrop(files); // Usar la función onDrop pasada por props
      }}
      className={`${classes.dropzone} ${loading ? classes.loading : ""}`}
      radius="md"
      mx="auto"
      mt="xs"
      aria-busy={loading}
    >
      <div style={{ cursor: "pointer" }}>
        <Group justify="center" pt="md">
          <Dropzone.Accept>
            <IconDownload
              style={{ width: rem(40), height: rem(40) }}
              color={theme.colors.blue[6]}
              stroke={1.5}
            />
          </Dropzone.Accept>
          <Dropzone.Reject>
            <IconX
              style={{ width: rem(40), height: rem(40) }}
              color={theme.colors.red[6]}
              stroke={1.5}
            />
          </Dropzone.Reject>
          <Dropzone.Idle>
            <IconCloudUpload
              style={{ width: rem(40), height: rem(40) }}
              stroke={1.5}
            />
          </Dropzone.Idle>
        </Group>
        <Text ta="center" fz="sm" c="dimmed" pb="sm">
          {text}
        </Text>
        {loading && <Progress className={classes.progress} value={100} animated aria-label="Carga en curso" />}
      </div>
    </Dropzone>
  );
};

export default DropzoneCustomComponent;
