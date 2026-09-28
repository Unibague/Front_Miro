'use client';
import { createContext, useState, useContext, ReactNode } from "react";

type RoleContextType = {
  userRole: string;
  setUserRole: (role: string) => void;
  viewPermissions: Record<string, string[]>;
  setViewPermissions: (permissions: Record<string, string[]>) => void;
  permissionsLoaded: boolean;
  setPermissionsLoaded: (loaded: boolean) => void;
  userAccessProfiles: string[];
  setUserAccessProfiles: (profiles: string[]) => void;
  allowedDependencies: string[];
  setAllowedDependencies: (deps: string[]) => void;
  allowedDimensions: string[];
  setAllowedDimensions: (dims: string[]) => void;
  // true si la persona es líder/responsable de algo en el PDI: ve "Mis
  // proyectos PDI" con cualquier rol y aunque su perfil no incluya el PDI.
  pdiAsignado: boolean;
  setPdiAsignado: (asignado: boolean) => void;
  // true = los permisos los decide su perfil (aunque no tenga ninguno del rol
  // activo: entonces no ve nada en ese rol); false = sin perfiles, el rol decide.
  hasProfile: boolean;
  setHasProfile: (value: boolean) => void;
};

const RoleContext = createContext<RoleContextType | undefined>(undefined);

type RoleProviderProps = {
  children: ReactNode;
  initialRole: string;
};

export const RoleProvider = ({ children, initialRole }: RoleProviderProps) => {
  const [userRole, setUserRole] = useState<string>(initialRole);
  const [viewPermissions, setViewPermissions] = useState<Record<string, string[]>>({});
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const [userAccessProfiles, setUserAccessProfiles] = useState<string[]>([]);
  const [allowedDependencies, setAllowedDependencies] = useState<string[]>([]);
  const [allowedDimensions, setAllowedDimensions] = useState<string[]>([]);
  const [pdiAsignado, setPdiAsignado] = useState(false);
  const [hasProfile, setHasProfile] = useState(false);

  return (
    <RoleContext.Provider value={{ userRole, setUserRole, viewPermissions, setViewPermissions, permissionsLoaded, setPermissionsLoaded, userAccessProfiles, setUserAccessProfiles, allowedDependencies, setAllowedDependencies, allowedDimensions, setAllowedDimensions, pdiAsignado, setPdiAsignado, hasProfile, setHasProfile }}>
      {children}
    </RoleContext.Provider>
  );
};

export const useRole = () => {
  const context = useContext(RoleContext);
  if (context === undefined) {
    throw new Error("useRole must be used within a RoleProvider");
  }
  return context;
};
