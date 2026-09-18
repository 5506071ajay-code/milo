import React, { useEffect, useMemo } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { RouterProvider, useRouter, Link } from './components/router.jsx';
import { StoreProvider, useStore } from './store/store.jsx';
import { ToastProvider, I } from './components/ui.jsx';
import Home from './screens/Home.jsx';
import Journal from './screens/Journal.jsx';
import Transaction from './screens/Transaction.jsx';
import Add from './screens/Add.jsx';
import Split from './screens/Split.jsx';
import Owe from './screens/Owe.jsx';
import Settle from './screens/Settle.jsx';
import CFO from './screens/CFO.jsx';
import Accounts from './screens/Accounts.jsx';
import Purpose from './screens/Purpose.jsx';
import Forecast from './screens/Forecast.jsx';
import Calendar from './screens/Calendar.jsx';
import Emergency from './screens/Emergency.jsx';
import Allowance from './screens/Allowance.jsx';
import Spending from './screens/Spending.jsx';
import Micro from './screens/Micro.jsx';
import Goals from './screens/Goals.jsx';
import Streaks from './screens/Streaks.jsx';
import Health from './screens/Health.jsx';
import Patterns from './screens/Patterns.jsx';
import Duplicates from './screens/Duplicates.jsx';
import Notifications, { buildNotifications } from './screens/Notifications.jsx';
import More, { TOOLS } from './screens/More.jsx';
import SignIn from './screens/SignIn.jsx';
import { IS_NATIVE, setServerUrl } from './api.js';
import Welcome from './screens/Welcome.jsx';
import Import from './screens/Import.jsx';
import { Avatar } from './components/UserPicker.jsx';

const ROUTES = { home: Home, journal: Journal, tx: Transaction, add: Add, split: Split, owe: Owe, settle: Settle, cfo: CFO, accounts: Accounts, purpose: Purpose, forecast: Forecast, calendar: Calendar, emergency: Emergency, allowance: Allowance, spending: Spending, micro: Micro, goals: Goals, streaks: Streaks, health: Health, patterns: Patterns, duplicates: Duplicates, notifications: Notifications, more: More, welcome: Welcome, import: Import };

function NotFound() { return <div className="card" style={{ marginTop: 20 }}><b>Page not found</b><p className="small sub">This screen does not exist. <a href="#/home">Go home</a>.</p></div>; }

function Gate() {
  const { auth, state, loading, loadError, reload } = useStore();
  const { route } = useRouter();
  if (auth.status === 'loading' || (auth.status === 'authed' && !state && !loadError)) return <div className="boot" role="status" aria-live="polite"><span className="brand-mark lg" /><div className="tiny muted" style={{ marginTop: 14 }}>{auth.status === 'loading' ? 'Checking your session…' : 'Loading your financial identity…'}</div></div>;
  if (auth.status === 'error') return <div className="boot"><div className="card" style={{ maxWidth: 420 }}><b>MILO's server is unreachable.</b><p className="small sub">{auth.error}. The app needs its server for sign-in and data.</p><div className="row wrap" style={{ gap: 8 }}><button className="btn sm" onClick={() => window.location.reload()}>Retry</button>{IS_NATIVE && <button className="btn secondary sm" onClick={() => { setServerUrl(''); window.location.reload(); }}>Change server</button>}</div></div></div>;
  if (auth.status === 'anon') return <SignIn />;
  if (loadError) return <div className="boot"><div className="card" style={{ maxWidth: 420 }}><b>Could not load your data.</b><p className="small sub">{loadError}</p><button className="btn sm" onClick={reload}>Try again</button></div></div>;
  if (route.parts[0] === 'signin') { window.location.hash = '#/home'; return null; }
  if (!state.onboarded && route.parts[0] !== 'welcome' && route.parts[0] !== 'accounts') { window.location.hash = '#/welcome'; return null; }
  return <Shell />;
}

function Shell() {
  const { route } = useRouter();
  const { state, d, auth, loading } = useStore();
  const reduce = useReducedMotion();
  const Screen = ROUTES[route.parts[0] || 'home'] || NotFound;
  const unread = useMemo(() => buildNotifications(state, d).filter((n) => (n.server ? !n.read : !state.notificationsRead.includes(n.id))).length, [state, d]);
  const needs = d.purposePrompts.length + d.splitPrompts.length + d.needsReview.length;
  useEffect(() => { document.title = `MILO · ${(route.parts[0] || 'home').replace(/^\w/, (c) => c.toUpperCase())}`; }, [route]);
  const key = route.parts[0] === 'tx' || route.parts[0] === 'split' ? route.path : route.parts[0] || 'home';
  return (
    <div className="app">
      <nav className="rail" aria-label="Primary">
        <a className="brand" href="#/home"><span className="brand-mark" aria-hidden="true" />MILO</a>
        <Link to="/home">{I.home} Home</Link>
        <Link to="/journal">{I.journal} Journal {needs > 0 && <span className="badge count">{needs}</span>}</Link>
        <Link to="/owe">{I.split} Split-Bill Memory</Link>
        <Link to="/cfo">{I.cfo} AI CFO</Link>
        <div className="rail-group">MONEY</div>
        {TOOLS.filter(([to]) => ['/accounts', '/purpose', '/forecast', '/calendar', '/allowance', '/goals', '/emergency'].includes(to)).map(([to, icon, label]) => <Link key={to} to={to}>{I[icon]} {label}</Link>)}
        <div className="rail-group">INSIGHT</div>
        {TOOLS.filter(([to]) => ['/spending', '/micro', '/patterns', '/health', '/streaks', '/duplicates', '/settle'].includes(to)).map(([to, icon, label]) => <Link key={to} to={to}>{I[icon]} {label}</Link>)}
        <div className="rail-group" />
        <Link to="/notifications">{I.bell} Notifications {unread > 0 && <span className="badge count">{unread}</span>}</Link>
        <Link to="/more">{I.more} Everything</Link>
        <a href="#/more" className="rail-user"><Avatar u={auth.user} size={30} /><span className="ellipsis"><b className="small">{auth.user.name}</b><div className="tiny muted ellipsis">{auth.user.email}</div></span></a>
      </nav>
      <header className="topbar">
        <a className="brand" href="#/home"><span className="brand-mark" aria-hidden="true" />MILO</a>
        <div className="row" style={{ gap: 4 }}>
          <a href="#/notifications" className="btn ghost sm" aria-label={`Notifications, ${unread} unread`} style={{ position: 'relative' }}>{I.bell}{unread > 0 && <span className="badge count" style={{ position: 'absolute', top: 0, right: 0 }}>{unread}</span>}</a>
          <a href="#/cfo" className="btn sm">Ask CFO</a>
        </div>
      </header>
      <main className="main" id="main">
        {loading && <div className="syncbar" role="status" aria-label="Syncing" />}
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={key} initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -6 }} transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}>
            <Screen />
          </motion.div>
        </AnimatePresence>
      </main>
      {route.parts[0] !== 'add' && <a href="#/add" className="fab" aria-label="Add cash, informal money or a commitment">{I.plus}</a>}
      <nav className="tabbar" aria-label="Primary">
        <Link to="/home" className="tab">{I.home}<span>Home</span></Link>
        <Link to="/journal" className="tab">{I.journal}<span>Journal</span></Link>
        <Link to="/owe" className="tab">{I.split}<span>Split</span></Link>
        <Link to="/cfo" className="tab">{I.cfo}<span>CFO</span></Link>
        <Link to="/more" className="tab">{I.more}<span>More</span></Link>
      </nav>
    </div>
  );
}

export default function App() {
  return <RouterProvider><StoreProvider><ToastProvider><Gate /></ToastProvider></StoreProvider></RouterProvider>;
}
