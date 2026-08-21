"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Container, Title, Text, Button, Group } from "@mantine/core";
import { IconArrowLeft, IconBulb } from "@tabler/icons-react";
import errorAnimation from "@/public/lottie/error.json";
import dynamic from "next/dynamic";

type LottieProps = {
  animationData: object;
  loop: boolean;
  style: object;
};

const Lottie = dynamic(() => import("lottie-react").then((mod) => mod.default), {
  ssr: false,
}) as React.FC<LottieProps>;

export default function ErrorPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const error = searchParams?.get("error");

  return (
    <Container
      style={{ textAlign: "center", paddingTop: "5rem", maxWidth: "600px" }}
    >
      <Lottie
        animationData={errorAnimation}
        loop={false}
        style={{ height: 200, marginBottom: "2rem" }}
      />
      <Title order={1} style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>
        ¡Acceso Denegado! 
      </Title>
      <Text size="lg" color="dimmed" style={{ marginBottom: "1.5rem" }}>
        Parece que no tienes permiso para acceder a esta página.
      </Text>
      <Text c="dimmed" size="xs" ta={"center"} mt="md" mb={"md"}>
        <IconBulb color="#797979" size={20}></IconBulb>
        <br />
        Si crees que es un error, contacta al administrador del sistema.
      </Text>
      <Group justify="center">
        <Button
          size="md"
          variant="light"
          onClick={() => router.push("/")}
          leftSection={<IconArrowLeft size={16} />}
        >
          Volver al Inicio
        </Button>
      </Group>
    </Container>
  );
}
