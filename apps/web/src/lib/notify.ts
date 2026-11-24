/**
 * Desktop pop-ups through the browser's Notification API. On Windows, Chrome and Edge show
 * them as system toasts, so a long job can finish while the user works in another window.
 */

function isSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/**
 * Browsers only allow the permission prompt after a user action, so call this from a click
 * or submit handler. Does nothing when permission was already granted or denied.
 */
export function requestNotificationPermission(): void {
  if (!isSupported() || Notification.permission !== "default") return;
  void Notification.requestPermission().catch(() => undefined);
}

export type DesktopNotice = {
  title: string;
  body: string;
  /** Notices with the same tag replace each other instead of piling up. */
  tag: string;
};

export function showNotification(notice: DesktopNotice): void {
  if (!isSupported() || Notification.permission !== "granted") return;
  try {
    const notification = new Notification(notice.title, { body: notice.body, tag: notice.tag });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Some browsers only allow notifications from a service worker; the UI still shows status.
  }
}
