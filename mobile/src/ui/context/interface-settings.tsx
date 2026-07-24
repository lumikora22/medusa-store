import React, { createContext, useEffect, useState } from "react";

import { inventoryService } from "../../application/inventory-service";
import type { AppSettings } from "../../domain/models";

type InterfaceSettingsValue = {
  settings: AppSettings | null;
  largeInterface: boolean;
  scanSound: boolean;
  minTarget: number;
  textBoost: number;
  update<K extends "largeInterface" | "scanSound" | "backupReminderDays" | "tutorialSeen">(key: K, value: AppSettings[K]): Promise<void>;
  refresh(): Promise<void>;
};

const InterfaceSettingsContext = createContext<InterfaceSettingsValue | null>(null);

export function InterfaceSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const refresh = async () => setSettings(await inventoryService.getSettings());
  useEffect(() => { void refresh(); }, []);
  const update: InterfaceSettingsValue["update"] = async (key, value) => { await inventoryService.updateSetting(key, value); await refresh(); };
  const largeInterface = settings?.largeInterface ?? false;
  return <InterfaceSettingsContext value={{ settings, largeInterface, scanSound: settings?.scanSound ?? true, minTarget: largeInterface ? 56 : 48, textBoost: largeInterface ? 2 : 0, update, refresh }}>{children}</InterfaceSettingsContext>;
}

export function useInterfaceSettings(): InterfaceSettingsValue {
  const value = React.use(InterfaceSettingsContext);
  return value ?? { settings: null, largeInterface: false, scanSound: true, minTarget: 48, textBoost: 0, update: async () => undefined, refresh: async () => undefined };
}
