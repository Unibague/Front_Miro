"use client";

import DependencyTree from "@/app/components/DependencyTree"; 
import Dependency from "@/app/interfaces/Dependency";
import { Title } from "@mantine/core";
import { showNotification } from "@mantine/notifications";
import axios from "axios";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { usePeriod } from "@/app/context/PeriodContext"; 

const ReportsPage = () => {
  const { data: session } = useSession();
  const { selectedPeriodId } = usePeriod();
  const [loading, setLoading] = useState<boolean>(false);
  const [fatherDependency, setFatherDependency] = useState<Dependency>();
  const [childrenDependencies, setChildrenDependencies] = useState<Dependency[]>([]);

  useEffect(() => {
    const fetchFatherDependencyWithReports = async () => {
      if (!session?.user?.email || !selectedPeriodId) return;
      setLoading(true);
      try {
        console.log("Solicitando jerarquía de dependencias para el período:", selectedPeriodId);
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/dependencies/${session?.user?.email}/hierarchy`,
            { params: { periodId: selectedPeriodId } }
        );

        console.log("Reports data updated:", response.data);

        setFatherDependency(response.data.fatherDependency ?? undefined);
        setChildrenDependencies(response.data.childrenDependencies ?? []);
      } catch (error) {
        console.error("Error fetching reports:", error);
        showNotification({
          title: "Error",
          message: "Ocurrió un error al obtener los reports.",
          color: "red",
        });
      } finally {
        setLoading(false);
      }
    };

    // Reset data when period or dependency changes
    setFatherDependency(undefined);
    setChildrenDependencies([]);

    fetchFatherDependencyWithReports();
  }, [session?.user?.email, selectedPeriodId]);

  return (
    <div style={{ margin: "0px 20px 0px 20px" }}>
      {fatherDependency && (
        <>
          <Title __size="sm" mb={15}>
            Reportes de dependencias hijas {fatherDependency.name}
          </Title>
          <DependencyTree dependencies={childrenDependencies} showReports={true} />
          </>
      )}
    </div>
  );
};

export default ReportsPage;
