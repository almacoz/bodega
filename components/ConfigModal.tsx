"use client";

import { useRef, useState } from "react";
import { Download, Trash2, Upload, X } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { DEFAULT_NOTIFICATION_PREFS, getNotificationPrefs, updateNotificationPrefs } from "@/lib/notifications";
import type { Memory, NotificationPreferences } from "@/lib/types";
import { migrateMemory } from "@/lib/storage";
import { now, resetDemoClock } from "@/lib/clock";
import { Btn, Label } from "./ui";

export function ConfigModal({
  isOpen,
  onClose,
  memory,
  onUpdateMemory,
}: {
  isOpen: boolean;
  onClose: () => void;
  memory: Memory;
  onUpdateMemory: (newMemory: Memory) => void;
}) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [statusMsg, setStatusMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [browserHint, setBrowserHint] = useState<string | null>(null);

  if (!isOpen) return null;

  const prefs = getNotificationPrefs(memory);

  function setPref(patch: Partial<NotificationPreferences>) {
    onUpdateMemory(updateNotificationPrefs(memory, patch));
  }

  async function toggleBrowserNotifications() {
    setBrowserHint(null);
    if (prefs.browserNotifications) {
      setPref({ browserNotifications: false });
      return;
    }
    if (typeof window === "undefined" || !("Notification" in window)) {
      setBrowserHint(t.settings.notifications.unsupported);
      return;
    }
    if (Notification.permission === "granted") {
      setPref({ browserNotifications: true });
      return;
    }
    if (Notification.permission === "denied") {
      setBrowserHint(t.settings.notifications.permissionDenied);
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === "granted") {
      setPref({ browserNotifications: true });
    } else {
      setBrowserHint(t.settings.notifications.permissionDenied);
    }
  }

  function exportBackup() {
    try {
      const blob = new Blob([JSON.stringify(memory, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `whybuy-backup-${now().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setStatusMsg({ text: "Error exporting data", error: true });
    }
  }

  function handleFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setStatusMsg({ text: t.settings.importedError, error: true });
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content);
        if (parsed && Array.isArray(parsed.intentions)) {
          const importedMemory: Memory = migrateMemory(parsed);
          onUpdateMemory(importedMemory);
          setStatusMsg({ text: t.settings.importedSuccess });
        } else {
          setStatusMsg({ text: t.settings.importedError, error: true });
        }
      } catch {
        setStatusMsg({ text: t.settings.importedError, error: true });
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function clearMemory() {
    if (window.confirm(t.settings.clearConfirm)) {
      onUpdateMemory({ intentions: [], links: {}, reminders: [], notifications: [], notificationPrefs: prefs });
      setStatusMsg({ text: t.settings.memoryCleared });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-xs">
      <div
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl transition-all sm:p-7"
        role="dialog"
        aria-modal="true"
        aria-label={t.settings.title}
      >
        <div className="flex items-center justify-between border-b border-line pb-4">
          <h2 className="font-sans text-xl font-bold tracking-tight text-fg">{t.settings.title}</h2>
          <button
            onClick={onClose}
            aria-label={t.settings.close}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-6 space-y-6">
          {/* Notificaciones */}
          <div className="border-t border-line pt-4">
            <Label>{t.settings.notifications.title}</Label>
            <div className="space-y-3">
              <label className="flex cursor-pointer items-start justify-between gap-4">
                <span>
                  <span className="block text-sm font-medium text-fg">{t.settings.notifications.memoryRecall}</span>
                  <span className="block text-xs text-dim">{t.settings.notifications.memoryRecallDesc}</span>
                </span>
                <input
                  type="checkbox"
                  checked={prefs.memoryRecall}
                  onChange={(e) => setPref({ memoryRecall: e.target.checked })}
                  className="mt-1 h-4 w-4 accent-emerald-600"
                />
              </label>

              <label className="flex cursor-pointer items-start justify-between gap-4">
                <span>
                  <span className="block text-sm font-medium text-fg">{t.settings.notifications.decisionReminders}</span>
                  <span className="block text-xs text-dim">{t.settings.notifications.decisionRemindersDesc}</span>
                </span>
                <input
                  type="checkbox"
                  checked={prefs.decisionReminders}
                  onChange={(e) => setPref({ decisionReminders: e.target.checked })}
                  className="mt-1 h-4 w-4 accent-emerald-600"
                />
              </label>

              <label className="flex cursor-pointer items-start justify-between gap-4">
                <span>
                  <span className="block text-sm font-medium text-fg">{t.settings.notifications.browserNotifications}</span>
                  <span className="block text-xs text-dim">{t.settings.notifications.browserNotificationsDesc}</span>
                </span>
                <input
                  type="checkbox"
                  checked={prefs.browserNotifications}
                  onChange={toggleBrowserNotifications}
                  className="mt-1 h-4 w-4 accent-emerald-600"
                />
              </label>

              {browserHint && <p className="text-xs text-amber-800">{browserHint}</p>}
              <p className="text-[11px] text-slate-400">{t.settings.notifications.localOnlyNote}</p>
            </div>
          </div>

          {process.env.NEXT_PUBLIC_DEMO_MODE === "true" && <div className="border-t border-line pt-4"><Btn onClick={() => { if (!window.confirm(t.wait.resetConfirm)) return; resetDemoClock(); onUpdateMemory({ intentions: [], links: {}, reminders: [], notifications: [], notificationPrefs: prefs }); setStatusMsg({ text: t.settings.memoryCleared }); }} className="text-xs">{t.wait.resetDemo}</Btn></div>}

          {/* Gestión de Memoria */}
          <div className="border-t border-line pt-4">
            <Label>{t.settings.memory}</Label>
            <p className="mb-3 font-mono text-xs font-medium text-slate-500">
              {memory.intentions.length} {t.settings.intentionsStored}
            </p>
            <div className="flex flex-wrap gap-2">
              <Btn onClick={exportBackup} className="text-xs">
                <Download size={13} />
                {t.settings.export}
              </Btn>
              <Btn onClick={() => fileInputRef.current?.click()} className="text-xs">
                <Upload size={13} />
                {t.settings.import}
              </Btn>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleFileImport}
              />
              {memory.intentions.length > 0 && (
                <Btn
                  onClick={clearMemory}
                  className="border-amber-200 bg-amber-50/50 text-xs text-amber-800 hover:bg-amber-100"
                >
                  <Trash2 size={13} />
                  {t.settings.clear}
                </Btn>
              )}
            </div>
          </div>

          {statusMsg && (
            <p
              className={`rounded-lg p-2.5 text-xs font-mono font-medium ${
                statusMsg.error
                  ? "border border-amber-200 bg-amber-50 text-amber-800"
                  : "border border-emerald-200 bg-emerald-50 text-emerald-800"
              }`}
            >
              {statusMsg.text}
            </p>
          )}
        </div>

        <div className="mt-8 flex justify-end border-t border-line pt-4">
          <Btn variant="primary" onClick={onClose}>
            {t.settings.close}
          </Btn>
        </div>
      </div>
    </div>
  );
}

