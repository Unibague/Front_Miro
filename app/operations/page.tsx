"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function OperationsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/reports");
  }, [router]);

  return null;
}
