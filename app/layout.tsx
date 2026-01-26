import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import '@mantine/dates/styles.css';
import 'mantine-datatable/styles.layer.css';
import '@mantine/dropzone/styles.css';
import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./Providers";
import { Notifications } from "@mantine/notifications";
import { MantineProvider, ColorSchemeScript } from "@mantine/core";
import { RoleProvider } from "./context/RoleContext";
import { AppInitializer } from "./context/AppInitializer";
import ClientLayout from "./ClientLayout";
import { PeriodProvider } from "./context/PeriodContext";
import { ModalsProvider } from "@mantine/modals";


export const metadata: Metadata = {
  title: "MIRÓ",
  description: "Miró",
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <head>
        <ColorSchemeScript />
      </head>
      <body>
        <Providers>
          <MantineProvider>
            <ModalsProvider>
              <RoleProvider initialRole="Usuario">
                <PeriodProvider>
                  <AppInitializer>
                    <Notifications />
                    <ClientLayout>{children}</ClientLayout>
                  </AppInitializer>
                </PeriodProvider>
              </RoleProvider>
            </ModalsProvider>
          </MantineProvider>
        </Providers>
      </body>
    </html>
  );
}
