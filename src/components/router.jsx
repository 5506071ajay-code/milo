import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

const RouterCtx = createContext(null);

function parse() {
  const h = (typeof window !== 'undefined' ? window.location.hash : '') || '#/home';
  const [path, qs] = h.slice(1).split('?');
  const parts = path.split('/').filter(Boolean);
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  return { path: '/' + parts.join('/'), parts, params };
}

export function RouterProvider({ children }) {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => { setRoute(parse()); window.scrollTo({ top: 0 }); };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const navigate = useCallback((to) => { if (typeof to === 'number') window.history.go(to); else window.location.hash = to.startsWith('#') ? to : '#' + to; }, []);
  return <RouterCtx.Provider value={{ route, navigate }}>{children}</RouterCtx.Provider>;
}

export function useRouter() { return useContext(RouterCtx); }

export function Link({ to, children, className = '', ...rest }) {
  const { route } = useRouter();
  const active = route.path === to || (to !== '/home' && route.path.startsWith(to + '/'));
  return <a href={'#' + to} className={`${className} ${active ? 'active' : ''}`.trim()} aria-current={active ? 'page' : undefined} {...rest}>{children}</a>;
}
