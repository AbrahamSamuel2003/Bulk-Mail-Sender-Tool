"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Ban,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  History,
  LayoutDashboard,
  MessageSquareReply,
  Settings,
  X,
} from "lucide-react";

const globalNav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/campaigns", label: "Campaigns", icon: FolderKanban },
  { href: "/history", label: "Email History", icon: History },
  { href: "/replies", label: "Replies", icon: MessageSquareReply },
  { href: "/suppressed", label: "Suppressed", icon: Ban },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  isOpen = false,
  onClose,
  collapsed = false,
  onToggleCollapse,
}: {
  isOpen?: boolean;
  onClose?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const pathname = usePathname();

  function renderNavLinks(isCompact: boolean) {
    return (
      <nav className="flex-1 overflow-y-auto py-3">
        <div
          className={`flex items-center pb-1.5 ${
            isCompact ? "justify-center px-2" : "justify-between px-4"
          }`}
        >
          {!isCompact && (
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#605E5C]">
              Workspace
            </p>
          )}
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              title={isCompact ? "Open side menu" : "Close side menu"}
              aria-label={isCompact ? "Open side menu" : "Close side menu"}
              className="hidden h-6 w-6 items-center justify-center rounded border border-[#EDEBE9] bg-white text-[#605E5C] shadow-2xs transition-colors hover:border-[#8A8886] hover:bg-[#FAF9F8] hover:text-[#323130] lg:inline-flex"
            >
              {isCompact ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronLeft className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>

        <div className="space-y-0.5">
          {globalNav.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={isCompact ? item.label : undefined}
                onClick={() => onClose?.()}
                className={`relative flex items-center py-2.5 text-[13px] transition-colors lg:py-2 ${
                  isCompact ? "justify-center px-2" : "gap-3 px-4"
                } ${
                  active
                    ? "bg-white font-semibold text-[#0078D4]"
                    : "font-normal text-[#323130] hover:bg-[#E1DFDD]"
                }`}
              >
                {active && (
                  <span className="absolute left-0 top-1 bottom-1 w-[3px] bg-[#0078D4]" />
                )}
                <Icon
                  className={`h-4 w-4 shrink-0 ${active ? "text-[#0078D4]" : "text-[#605E5C]"}`}
                />
                {!isCompact && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </div>
      </nav>
    );
  }

  return (
    <>
      {/* Desktop docked rail (collapsible with clean arrow) */}
      <aside
        className={`hidden shrink-0 flex-col border-r border-[#EDEBE9] bg-[#F3F2F1] transition-all duration-200 lg:flex ${
          collapsed ? "w-14" : "w-56"
        }`}
      >
        {renderNavLinks(collapsed)}
      </aside>

      {/* Mobile slide-over drawer */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => onClose?.()}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-[#EDEBE9] bg-[#F3F2F1] transition-transform duration-200 ease-out lg:hidden ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-12 items-center justify-between border-b border-[#EDEBE9] bg-[#0078D4] px-4 text-white">
          <span className="text-sm font-semibold">SS40 Email Outreach</span>
          <button
            type="button"
            aria-label="Close Navigation"
            onClick={() => onClose?.()}
            className="flex h-9 w-9 items-center justify-center rounded hover:bg-white/15"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {renderNavLinks(false)}
      </aside>
    </>
  );
}
