"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import axios from "axios";

interface Period {
  _id: string;
  name: string;
  is_active?: boolean;
  end_date?: string;
}

interface PeriodContextType {
  selectedPeriodId: string | null;
  setSelectedPeriodId: (periodId: string | null) => void;
  availablePeriods: Period[];
  refreshPeriods: () => Promise<void>;
}

const PeriodContext = createContext<PeriodContextType | undefined>(undefined);

const resolveSelectedPeriodId = (periods: Period[], preferredPeriodId: string | null) => {
  const activePeriod = periods
    .filter((period) => period.is_active)
    .sort((a, b) => new Date(b.end_date || 0).getTime() - new Date(a.end_date || 0).getTime())[0];
  const preferredPeriod = periods.find((period) => period._id === preferredPeriodId);

  if (!activePeriod) {
    return preferredPeriod?._id || periods[0]?._id || null;
  }

  return preferredPeriod?.is_active ? preferredPeriod._id : activePeriod._id;
};

export const PeriodProvider = ({ children }: { children: ReactNode }) => {
  const [selectedPeriodId, setSelectedPeriodIdState] = useState<string | null>(null);
  const [availablePeriods, setAvailablePeriods] = useState<Period[]>([]);

  const setSelectedPeriodId = useCallback((periodId: string | null) => {
    setSelectedPeriodIdState(periodId);

    if (periodId) {
      localStorage.setItem("selectedPeriodId", periodId);
    } else {
      localStorage.removeItem("selectedPeriodId");
    }
  }, []);

  const refreshPeriods = useCallback(async () => {
    try {
      const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/periods/allperiods`);
      if (Array.isArray(response.data)) {
        const periods = response.data as Period[];
        setAvailablePeriods(periods);

        setSelectedPeriodIdState((currentPeriodId) => {
          const savedPeriodId = localStorage.getItem("selectedPeriodId");
          const nextPeriodId = resolveSelectedPeriodId(periods, currentPeriodId || savedPeriodId);

          if (nextPeriodId) {
            localStorage.setItem("selectedPeriodId", nextPeriodId);
          } else {
            localStorage.removeItem("selectedPeriodId");
          }

          return nextPeriodId;
        });
      } else {
        console.error("La respuesta del API no es un array:", response.data);
      }
    } catch (error) {
      console.error("Error fetching periods:", error);
    }
  }, []);

  useEffect(() => {
    refreshPeriods();
  }, [refreshPeriods]);

  return (
    <PeriodContext.Provider value={{ selectedPeriodId, setSelectedPeriodId, availablePeriods, refreshPeriods }}>
      {children}
    </PeriodContext.Provider>
  );
};

export const usePeriod = () => {
  const context = useContext(PeriodContext);
  if (!context) {
    throw new Error("usePeriod must be used within a PeriodProvider");
  }
  return context;
};
