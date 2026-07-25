import * as LocalAuthentication from "expo-local-authentication";

/**
 * Device-owner confirmation, used to recover Exhibition Mode when the PIN is lost.
 *
 * Whoever can unlock the phone already controls the app, so the device credential is a
 * legitimate escape hatch. Every call degrades to "unavailable" instead of throwing, so a
 * runtime without the native module — or a phone with no lock screen at all — simply hides
 * the recovery option rather than offering one that cannot work.
 */
export async function canConfirmDeviceOwner(): Promise<boolean> {
  try {
    return (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.NONE;
  } catch {
    return false;
  }
}

export async function confirmDeviceOwner(promptMessage: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage, cancelLabel: "Cancelar", disableDeviceFallback: false });
    return result.success;
  } catch {
    return false;
  }
}
