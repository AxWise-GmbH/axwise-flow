import { forwardRef } from 'react';

export const useNavigate = () => () => {};
export const useLocation = () => ({ pathname: '/', search: '', hash: '', state: null });
export const useSearchParams = () => [new URLSearchParams(), () => {}];
export const useParams = () => ({});
export const useMatch = () => null;
export const useResolvedPath = (to) => ({
  pathname: typeof to === 'string' ? to : '/',
  search: '',
  hash: '',
});
export const useHref = (to) => (typeof to === 'string' ? to : '#');

export const Link = forwardRef(function Link({ to, children, onClick, ...rest }, ref) {
  const handleClick = (e) => {
    e.preventDefault();
    if (typeof onClick === 'function') onClick(e);
  };
  return (
    <a ref={ref} href="#" onClick={handleClick} {...rest}>
      {children}
    </a>
  );
});

export const NavLink = Link;
export const Navigate = () => null;
export const Outlet = () => null;
export const Routes = ({ children }) => <>{children}</>;
export const Route = () => null;
export const BrowserRouter = ({ children }) => <>{children}</>;
export const MemoryRouter = ({ children }) => <>{children}</>;
export const HashRouter = ({ children }) => <>{children}</>;
export const RouterProvider = ({ children }) => <>{children}</>;

export default {
  useNavigate,
  useLocation,
  useSearchParams,
  useParams,
  useMatch,
  useResolvedPath,
  useHref,
  Link,
  NavLink,
  Navigate,
  Outlet,
  Routes,
  Route,
  BrowserRouter,
  MemoryRouter,
  HashRouter,
  RouterProvider,
};
