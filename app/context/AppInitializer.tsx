'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRole } from './RoleContext';
import { usePathname } from 'next/navigation';
import axios from 'axios';
import LoadingScreen from '../components/LoadingScreen';

export const AppInitializer = ({ children }: { children: React.ReactNode }) => {
  const { data: session, status } = useSession();
  const { setUserRole, setViewPermissions, setPermissionsLoaded, setUserAccessProfiles, setAllowedDependencies, setAllowedDimensions } = useRole();
  const pathname = usePathname() ?? '';
  const isPublic = pathname.startsWith('/public');
  const [isRoleLoaded, setIsRoleLoaded] = useState(isPublic);

  // Adjunta el email de sesión a toda petición axios que no lo traiga ya, para
  // que el middleware de autorización del backend (requireAdmin/requireReadAccess)
  // pueda identificar al usuario sin tener que tocar cada llamada existente.
  useEffect(() => {
    const email = session?.user?.email;
    if (!email) return;

    const interceptorId = axios.interceptors.request.use((config) => {
      if (!config.headers) config.headers = {} as typeof config.headers;
      if (!config.headers['user-email']) {
        config.headers['user-email'] = email;
      }
      return config;
    });

    return () => { axios.interceptors.request.eject(interceptorId); };
  }, [session?.user?.email]);

  useEffect(() => {
    const fetchUserRole = async () => {
      if (session?.user?.email) {
        try {
          const response = await axios.get(`${process.env.NEXT_PUBLIC_API_URL}/users/roles`, {
            params: { email: session.user.email },
          });
          if (response.data.activeRole) {
            setUserRole(response.data.activeRole);
          } else if (response.data.roles?.length > 0) {
            setUserRole(response.data.roles[0]);
          } else {
            setUserRole("Usuario");
          }
          if (response.data.viewPermissions) {
            setViewPermissions(response.data.viewPermissions);
          } else {
            setViewPermissions({});
          }
          setUserAccessProfiles(response.data.accessProfiles || []);
          setAllowedDependencies(response.data.allowedDependencies || []);
          setAllowedDimensions(response.data.allowedDimensions || []);
          setPermissionsLoaded(true);
        } catch (error) {
          console.error("Error fetching user role from database:", error);
          setPermissionsLoaded(true);
        } finally {
          setIsRoleLoaded(true);
        }
      } else {
        setPermissionsLoaded(true);
        setIsRoleLoaded(true);
      }
    };

    if (status !== "loading") {
      fetchUserRole();
    }
  }, [session, status]);

  if (!isRoleLoaded) {
    return <LoadingScreen />;
  }

  return <>{children}</>;
};
