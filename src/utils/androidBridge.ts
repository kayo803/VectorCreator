import { Capacitor } from '@capacitor/core';

interface NativeAndroidBridge {
  saveBase64File?: (filename: string, base64Data: string, mimeType: string) => boolean;
}

declare global {
  interface Window {
    AndroidBridge?: NativeAndroidBridge;
  }
}

export function isAndroidNativeApp(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export function saveBase64ToAndroidDownloads(
  filename: string,
  base64Data: string,
  mimeType: string
): boolean {
  if (typeof window === 'undefined' || !window.AndroidBridge?.saveBase64File) {
    return false;
  }
  try {
    return window.AndroidBridge.saveBase64File(filename, base64Data, mimeType);
  } catch {
    return false;
  }
}

export function textToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}
