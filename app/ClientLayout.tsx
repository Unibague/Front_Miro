"use client";

import React, { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Navbar from "./components/navbar/Navbar";
import Footer from "./components/footer/Footer";
import ProtectedRoutes from "./utils/ProtectedRoutes";
import AffixButton from "./components/Affix/AffixButton";
import { useUnsavedChanges } from "./context/UnsavedChangesContext";

interface ClientLayoutProps {
  children: React.ReactNode;
}

const ClientLayout = ({ children }: ClientLayoutProps) => {
  const pathname = usePathname();
  const { hasChanges, confirmNavigation } = useUnsavedChanges();

  const isSignInPage = pathname === '/';
  const isPublicPage = pathname?.startsWith('/public');

  // Interceptar botón atrás / cierre de pestaña del browser
  useEffect(() => {
    if (!hasChanges) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasChanges]);

  return (
    <>
      {!isSignInPage && !isPublicPage && <Navbar />}
      {!isPublicPage && <AffixButton />}
      <ProtectedRoutes>{children}</ProtectedRoutes>
      {!isSignInPage && !isPublicPage && <Footer />}
    </>
  );
};

export default ClientLayout;
