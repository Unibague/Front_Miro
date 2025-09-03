"use client";

import { Center, Container, Table, Badge } from "@mantine/core";
import axios from "axios";
import { useParams } from "next/navigation";
import React, { useEffect, useState } from "react";
import { usePeriod } from "@/app/context/PeriodContext";

interface Template {
  _id: string;
  name: string;
  isSent: boolean;
}

const DependencyTemplatesPage = () => {
  const params = useParams();
  const { selectedPeriodId } = usePeriod();
  const { id } = params;

  const [templates, setTemplates] = useState<Template[]>([]);
  const [dependencyName, setDependencyName] = useState<string>("");

  useEffect(() => {
    if (!id || !selectedPeriodId) return; // Asegurarse de que los parámetros estén definidos
  
    const fetchDependencyTemplates = async () => {
      try {
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/dependencies/${id}/templates`,
          {
            params: {
              periodId: selectedPeriodId,
              limit: 10,
            },
          }
        );
    
        // Verifica la respuesta completa
        console.log("Response from API:", response);
        
        // Asumiendo que la respuesta contiene un array de plantillas directamente
        setTemplates(response.data.templates); // Aquí asignamos los datos directamente
    
        // Si quieres obtener el nombre de la dependencia también
        setDependencyName(response.data.dependencyName); // Asegúrate de que 'dependencyName' exista en la respuesta
    
      } catch (error) {
        console.error("Error fetching templates:", error);
      }
    };
    
    
  
    fetchDependencyTemplates();
  }, [id, selectedPeriodId]); 
  
  console.log(templates); // Verifica que `templates` contiene los objetos esperados
  return (
    <Container size="xl">
      <h2>
        {dependencyName
          ? `Plantillas asignadas a la dependencia ${dependencyName}`
          : "Plantillas"}
      </h2>
      <Table striped withTableBorder mt="md">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>
              <Center inline>Plantilla</Center>
            </Table.Th>
            <Table.Th>
              <Center inline>Estado</Center>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {templates.map((template) => (
            <Table.Tr key={template._id}>
              <Table.Td>{template.name}</Table.Td>
              <Table.Td>
                <Badge color={template.isSent ? "green" : "red"}>
                  {template.isSent ? "CARGADA" : "PENDIENTE"}
                </Badge>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Container>
  );
};

export default DependencyTemplatesPage;
