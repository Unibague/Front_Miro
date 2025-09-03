"use client";

import { Center, Container, Table, Badge, Button } from "@mantine/core";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import { usePeriod } from "@/app/context/PeriodContext";

interface Report {
  _id: string;
  name: string;
  isSent: boolean;
}

const DependencyReportsPage = () => {
  const params = useParams();
  const router = useRouter();
  const { selectedPeriodId } = usePeriod();
  const { id } = params;

  const [reports, setReports] = useState<Report[]>([]);
  const [dependencyName, setDependencyName] = useState<string>("");

  useEffect(() => {
    if (!id || !selectedPeriodId) return;

    const fetchDependencyReports = async () => {
      try {
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/dependencies/${id}/reports`,
          {
            params: { periodId: selectedPeriodId, limit: 10 },
          }
        );

        console.log("Reportes obtenidos:", response.data);

        setReports(response.data.reports ?? []);
        setDependencyName(response.data.dependencyName);
      } catch (error) {
        console.error("Error al obtener reportes:", error);
      }
    };

    fetchDependencyReports();
  }, [id, selectedPeriodId]);

  return (
    <Container size="xl">
      <h2>
        {dependencyName
          ? `Reportes asignados a la dependencia ${dependencyName}`
          : "Reportes"}
      </h2>
      <Table striped withTableBorder mt="md">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>
              <Center inline>Reporte</Center>
            </Table.Th>
            <Table.Th>
              <Center inline>Estado</Center>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {reports.map((report) => (
            <Table.Tr key={report._id}>
              <Table.Td>{report.name}</Table.Td>
              <Table.Td>
                <Badge color={report.isSent ? "green" : "red"}>
                  {report.isSent ? "ENVIADO" : "PENDIENTE"}
                </Badge>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Container>
  );
};

export default DependencyReportsPage;
