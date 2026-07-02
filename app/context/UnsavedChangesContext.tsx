"use client";

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { Modal, Button, Group, Text, ThemeIcon, Stack } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";

interface ConfirmNavigationOptions {
  // Pasar true cuando onConfirm es router.back(): mientras hay cambios sin guardar
  // se empuja una entrada "dummy" al historial (ver efecto de popstate más abajo), así
  // que un router.back() normal solo consume esa entrada dummy y no navega a ninguna parte.
  isBackNavigation?: boolean;
}

interface UnsavedChangesContextType {
  setHasChanges: (val: boolean) => void;
  hasChanges: boolean;
  confirmNavigation: (onConfirm: () => void, options?: ConfirmNavigationOptions) => void;
}

const UnsavedChangesContext = createContext<UnsavedChangesContextType>({
  setHasChanges: () => {},
  hasChanges: false,
  confirmNavigation: (cb) => cb(),
});

export function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const [hasChanges, setHasChanges] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const pendingCallback = useRef<(() => void) | null>(null);

  const confirmNavigation = useCallback((onConfirm: () => void, options?: ConfirmNavigationOptions) => {
    if (!hasChanges) {
      onConfirm();
      return;
    }
    // Si es una navegación "atrás", hay que saltar la entrada dummy que se agregó al detectar
    // cambios sin guardar, igual que hace el interceptor del botón atrás nativo del navegador.
    pendingCallback.current = options?.isBackNavigation
      ? () => window.history.go(-2)
      : onConfirm;
    setModalOpen(true);
  }, [hasChanges]);

  // Interceptar flecha "atrás" del navegador
  useEffect(() => {
    if (!hasChanges) return;

    window.history.pushState(null, "", window.location.href);

    const handlePopState = () => {
      window.history.pushState(null, "", window.location.href);
      pendingCallback.current = () => window.history.go(-2);
      setModalOpen(true);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [hasChanges]);

  // Interceptar cierre/refresco de pestaña
  useEffect(() => {
    if (!hasChanges) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasChanges]);

  const handleConfirm = () => {
    setModalOpen(false);
    setHasChanges(false);
    pendingCallback.current?.();
    pendingCallback.current = null;
  };

  const handleCancel = () => {
    setModalOpen(false);
    pendingCallback.current = null;
  };

  return (
    <UnsavedChangesContext.Provider value={{ hasChanges, setHasChanges, confirmNavigation }}>
      {children}
      <Modal
        opened={modalOpen}
        onClose={handleCancel}
        withCloseButton={false}
        centered
        size="sm"
        radius="lg"
        zIndex={1000}
        overlayProps={{ backgroundOpacity: 0.4, blur: 3, zIndex: 999 }}
      >
        <Stack align="center" gap="md" py="xs">
          <ThemeIcon size={52} radius="xl" color="orange" variant="light">
            <IconAlertTriangle size={28} />
          </ThemeIcon>
          <Text fw={700} size="lg" ta="center">¿Salir sin guardar?</Text>
          <Text size="sm" c="dimmed" ta="center">
            Tienes cambios sin guardar. Si sales ahora, se perderán todos los cambios realizados.
          </Text>
          <Group justify="center" gap="sm" w="100%">
            <Button variant="default" radius="md" onClick={handleCancel}>
              Seguir editando
            </Button>
            <Button color="orange" radius="md" onClick={handleConfirm}>
              Salir sin guardar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges() {
  return useContext(UnsavedChangesContext);
}
