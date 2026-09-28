"use client";

import { Dispatch, SetStateAction, useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const readStorage = (key: string, initialValue: string): string => {
  if (typeof window === "undefined") return initialValue;
  try {
    return window.localStorage.getItem(key) ?? initialValue;
  } catch {
    return initialValue;
  }
};

/**
 * Estado de búsqueda que se conserva en localStorage por ruta, para que al salir
 * de una página y volver a entrar la búsqueda siga ahí.
 * `name` distingue varios buscadores dentro de la misma página.
 */
export function usePersistentSearch(
  name = "search",
  initialValue = "",
): [string, Dispatch<SetStateAction<string>>] {
  const pathname = usePathname() ?? "";
  const key = `miro_search:${pathname}:${name}`;
  const [state, setState] = useState(() => ({ key, value: readStorage(key, initialValue) }));

  // Si cambia la ruta (p. ej. /dimensions/1 → /dimensions/2) se carga la búsqueda de la nueva.
  const current = state.key === key ? state : { key, value: readStorage(key, initialValue) };
  if (current !== state) setState(current);

  useEffect(() => {
    try {
      if (current.value) window.localStorage.setItem(current.key, current.value);
      else window.localStorage.removeItem(current.key);
    } catch {
      // localStorage no disponible: la búsqueda simplemente no se recuerda.
    }
  }, [current.key, current.value]);

  const setValue = useCallback<Dispatch<SetStateAction<string>>>((action) => {
    setState((previous) => ({
      key: previous.key,
      value: typeof action === "function" ? action(previous.value) : action,
    }));
  }, []);

  return [current.value, setValue];
}
