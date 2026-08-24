// Browser Notification utility for ID Messenger

export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isNotificationSupported()) {
    console.warn('Browser does not support notifications');
    return 'unsupported';
  }

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (error) {
    console.error('Error requesting notification permission:', error);
    return Notification.permission;
  }
}

export function sendBrowserNotification(title: string, options?: NotificationOptions & { onClick?: () => void }) {
  if (!isNotificationSupported()) return null;
  if (Notification.permission !== 'granted') return null;

  try {
    const notification = new Notification(title, {
      icon: 'https://api.iconify.design/lucide:message-square.svg?color=%233b82f6',
      badge: 'https://api.iconify.design/lucide:message-square.svg?color=%233b82f6',
      silent: false,
      ...options,
    });

    notification.onclick = () => {
      window.focus();
      if (options?.onClick) {
        options.onClick();
      }
      notification.close();
    };

    // Auto-close notification after 6 seconds
    setTimeout(() => {
      try {
        notification.close();
      } catch {}
    }, 6000);

    return notification;
  } catch (error) {
    console.error('Failed to trigger notification:', error);
    return null;
  }
}
