import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

let configured = false;
let available = false;

type NotificationsModule = typeof import('expo-notifications');

async function loadModule(): Promise<NotificationsModule | null> {
  if (Platform.OS === 'web') return null;
  try {
    const mod = (await import('expo-notifications')) as NotificationsModule;
    return mod;
  } catch {
    return null;
  }
}

export async function setupNotifications(): Promise<void> {
  if (configured || Platform.OS === 'web') return;
  configured = true;
  const mod = await loadModule();
  if (!mod) return;
  available = true;
  try {
    mod.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  } catch {
    available = false;
  }
}

/**
 * 到达裁决点 / 交付时的本地通知。
 * 在 Expo Go 或未授权时静默降级：App 内仍有顶部通知条。
 */
export async function pushLocalNotification(title: string, body: string): Promise<void> {
  if (Platform.OS === 'web') return;
  const mod = await loadModule();
  if (!mod) return;
  try {
    const permissions = await mod.getPermissionsAsync();
    let granted = permissions.granted;
    if (!granted) {
      const request = await mod.requestPermissionsAsync();
      granted = request.granted;
    }
    if (!granted) return;
    await mod.scheduleNotificationAsync({
      content: { title, body, sound: false },
      trigger: null,
    });
  } catch {
    // 通知失败不影响主流程
  }
}

export function notificationsAvailable(): boolean {
  return available;
}
