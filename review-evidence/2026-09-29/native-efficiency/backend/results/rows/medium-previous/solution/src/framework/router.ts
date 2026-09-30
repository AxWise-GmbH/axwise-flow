export interface Request { fail?: boolean; id: string; }
export interface Response { send(value: string): string; }
export type Next = (error: unknown) => void;
export type Handler = (req: Request, res: Response, next: Next) => unknown;
export class Router {
  routes: {method: string; path: string; handler: Handler}[] = [];
  get(path: string, handler: Handler) { this.routes.push({method:'GET',path,handler}); }
  post(path: string, handler: Handler) { this.routes.push({method:'POST',path,handler}); }
  delete(path: string, handler: Handler) { this.routes.push({method:'DELETE',path,handler}); }
}
