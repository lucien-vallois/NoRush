import React, { Suspense, useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Eye } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { apiService } from "../../services/api";
import Sidebar from "./Sidebar";
import Header from "./Header";
import LoadingSpinner from "../common/LoadingSpinner";

const Layout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [demoReadOnly, setDemoReadOnly] = useState(false);
  const { user } = useAuth();
  const { t } = useTranslation();

  useEffect(() => {
    let active = true;
    apiService
      .getMeta()
      .then((meta) => active && setDemoReadOnly(meta.demoReadOnly))
      .catch(() => undefined); // older API without /meta: no banner
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-card focus:p-3"
      >
        {t("nav.skipToContent")}
      </a>
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Main content */}
      <div className="lg:pl-64 print:pl-0">
        {/* Header */}
        <Header onMenuClick={() => setSidebarOpen(true)} user={user} />

        {demoReadOnly && (
          <div
            role="status"
            className="flex items-start gap-2 border-b border-border bg-muted/60 px-4 py-2 text-xs text-muted-foreground sm:px-6 lg:px-8 print:hidden"
          >
            <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{t("nav.demoReadOnly")}</span>
          </div>
        )}

        {/* Page content */}
        <main id="main-content" className="p-4 sm:p-6 lg:p-8 print:p-0">
          <div className="mx-auto max-w-[1440px]">
            <Suspense
              fallback={
                <div className="flex min-h-[50vh] items-center justify-center">
                  <LoadingSpinner />
                </div>
              }
            >
              <Outlet />
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
