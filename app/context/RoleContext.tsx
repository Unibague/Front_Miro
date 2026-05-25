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

  return (
    <RoleContext.Provider value={{ userRole, setUserRole, viewPermissions, setViewPermissions, permissionsLoaded, setPermissionsLoaded, userAccessProfiles, setUserAccessProfiles }}>
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
