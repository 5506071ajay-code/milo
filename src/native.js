// Native (Capacitor) glue: system-browser Google sign-in with a deep-link return, server URL setup.
import { IS_NATIVE, Auth, setToken, getServerUrl } from './api.js';

let listeners = [];
export function onDeepLink(fn) { listeners.push(fn); return () => { listeners = listeners.filter((x) => x !== fn); }; }

/** Handle com.milo.app://auth?code=…  (also used by tests via window.__miloDeepLink). */
export async function handleDeepLink(url) {
  let u; try { u = new URL(url); } catch { return; }
  if (u.host !== 'auth' && u.pathname !== '//auth') return;
  const code = u.searchParams.get('code'); const error = u.searchParams.get('error');
  try { if (u.searchParams.get('created') === '1') sessionStorage.setItem('milo:firstRun', '1'); } catch { /* ignore */ }
  if (error) { listeners.forEach((fn) => fn({ error })); return; }
  try { const r = await Auth.exchange(code); setToken(r.token); listeners.forEach((fn) => fn({ ok: true, user: r.user })); }
  catch (e) { listeners.forEach((fn) => fn({ error: e.message })); }
}

export async function initNative() {
  if (!IS_NATIVE) return;
  window.__miloDeepLink = handleDeepLink;
  try {
    const { App } = await import('@capacitor/app');
    App.addListener('appUrlOpen', ({ url }) => handleDeepLink(url));
    const launch = await App.getLaunchUrl(); if (launch?.url) handleDeepLink(launch.url);
    App.addListener('backButton', ({ canGoBack }) => { if (window.location.hash && window.location.hash !== '#/home') window.history.back(); else App.exitApp(); });
  } catch { /* running outside Capacitor (browser simulation) */ }
}

/** Open Google sign-in in the system browser (Google blocks OAuth inside WebViews). */
export async function openGoogleNative() {
  const url = Auth.googleUrl();
  try { const { Browser } = await import('@capacitor/browser'); await Browser.open({ url, presentationStyle: 'popover' }); }
  catch { window.open(url, '_blank'); }
}
export const nativeHasServer = () => !!getServerUrl();
