"use client";

import {
  Container,
  Paper,
  Title,
  Text,
  Button,
  Stack,
  Center,
  Image,
  BackgroundImage,
  Accordion,
  useMantineColorScheme,
} from "@mantine/core";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import ThemeChanger from "./components/ThemeChanger/ThemeChanger";
import styles from "./page.module.css";
import axios from "axios";
import Linkify from "linkify-react";

interface AccordionSection {
  _id: string;
  title: string;
  description: string;
}

const HomePage = () => {
  const router = useRouter();
  const { colorScheme } = useMantineColorScheme();
  const { data: session, status } = useSession();
  const [sections, setSections] = useState<AccordionSection[]>([]);

  const fetchAccordionSections = async () => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/homeInfo`);
      setSections(response.data);
    } catch (error) {
      console.error("Error fetching accordion sections:", error);
    }
  };

  useEffect(() => {
    if (status === "authenticated") {
      router.push("/dashboard");
    }
    fetchAccordionSections();
  }, [status]);

  const handleLogin = () => {
    signIn("google");
  };

  return (
    <Container fluid p={0}>
      <div className={styles.imageColumn}>
        <BackgroundImage
          src="/assets/CanchaVertical.webp"
          style={{
            objectFit: "cover",
            height: "100vh",
            width: "100%",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              position: "relative",
            }}
          >
            <Paper
              m={"md"}
              p="xl"
              mt={"35%"}
              bg={"rgba(255, 255, 255, 0.616)"}
              className={styles.blurBackground}
              style={{
                textAlign: "center",
                width: "100%",
                maxWidth: "400px",
                position: "relative",
              }}
              shadow="lg"
            >
              <Stack align="center" style={{ position: "relative" }} gap={'xs'}>
                <Title order={1} fw={700}>
                  Bienvenidos a MIRÓ
                </Title>
                <div style={{ position: "relative", width: "20%" }}>
                  <Image
                    src="/assets/ojoMiro-light.svg"
                    style={{ width: "100%", height: "auto" }}
                    alt="Logo MIRO"
                    className={styles.rotate}
                  />
                </div>
              </Stack>
              <Stack mt={'sm'} align="center">
                <Text>Inicia sesión con tu cuenta institucional.</Text>
                <Button
                  variant="filled"
                  color="blue"
                  size="lg"
                  radius="md"
                  onClick={handleLogin}
                >
                  Iniciar Sesión
                </Button>
              </Stack>
            </Paper>
          </div>
        </BackgroundImage>
      </div>

      <div className={styles.scrollableContent}>
        <Title ta={"center"} mt={30}>
          ¡Conoce MIRÓ!🔎
        </Title>
        <Center mt={10}>
          <ThemeChanger/>
        </Center>
        <Accordion 
          m={30}
          mt={30}
          variant="separated"
          defaultValue="que-es-miro"
          classNames={{
            root: styles.root,
            item: styles.item,
            chevron: styles.chevron,
          }}>
          {sections.map((section, index) => (
          <Accordion.Item key={section._id} value={`section-${index}`}>
            <Accordion.Control>{section.title}</Accordion.Control>
              <Accordion.Panel style={{ whiteSpace: "pre-wrap" }}>
                <Linkify options={{ target: "_blank", rel: "noopener noreferrer" }}>
                  {section.description}
                </Linkify>
              </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>

        <Paper p={20} mt={50}>
          <Center>
            <Image m={10} h={100} src={`/assets/Logo-Unibagué-Acreditación-${colorScheme}.webp`}></Image>
          </Center>
          <Center>
            <Text>NIT: 890704382-1</Text>
          </Center>
          <Center>
            <Text>Carrera 22 Calle 67, Barrio Ambalá.</Text>
          </Center>
          <Center>
            <Text>Ibagué - Tolima - Colombia</Text>
          </Center>
          <Center>
            <Text>Teléfono: +57 (608) 279 52 25</Text>
          </Center>
        </Paper>
      </div>
    </Container>
  );
};

export default HomePage;
