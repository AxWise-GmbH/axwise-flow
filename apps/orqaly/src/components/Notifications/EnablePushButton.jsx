/**
 * EnablePushButton — one-tap Web Push opt-in.
 *
 * Requires the service worker at /sw.js to be registered (done in main.jsx).
 * Requires VAPID_PUBLIC_KEY to be set on the server; the button hides
 * itself when the key is empty (Web Push not configured).
 */
import { useEffect, useState } from 'react';
import { Button } from '@mui/material';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import { getVapidPublicKey, pushSubscribe } from '../../services/notificationService';

import AppIcon from '../icons/AppIcon';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export default function EnablePushButton({ size = 'small' }) {
  const [vapidKey, setVapidKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await getVapidPublicKey();
        if (cancelled) return;
        setVapidKey(r?.key || '');
      } catch {
        // server may not have the route yet — hide button silently
      }
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
        const existing = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
        if (!cancelled && existing) setSubscribed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleEnable = async () => {
    if (!vapidKey) return;
    setBusy(true);
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('Push notifications are not supported in this browser.');
      }
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Notification permission denied.');
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      await pushSubscribe(sub);
      setSubscribed(true);
    } catch (err) {
      // Surface the failure in console; component itself stays unsubscribed
      console.warn('[push] subscribe failed:', err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!vapidKey) return null;
  if (subscribed) {
    return (
      <Button
        size={size}
        variant="text"
        startIcon={
          <AppIcon
            name="NotificationsActiveOutlined"
            fallback={NotificationsActiveOutlinedIcon}
            sx={{ fontSize: 16 }}
          />
        }
        disabled
        sx={{ textTransform: 'none', fontSize: '0.72rem', opacity: 0.7 }}
      >
        Push notifications on
      </Button>
    );
  }

  return (
    <Button
      size={size}
      variant="outlined"
      startIcon={
        <AppIcon
          name="NotificationsActiveOutlined"
          fallback={NotificationsActiveOutlinedIcon}
          sx={{ fontSize: 16 }}
        />
      }
      onClick={handleEnable}
      disabled={busy}
      sx={{ textTransform: 'none', fontSize: '0.72rem' }}
    >
      {busy ? 'Enabling…' : 'Enable push notifications'}
    </Button>
  );
}
