declare module 'axios' {
  export interface AxiosRequestHeaders extends Record<string, string> {}

  export interface AxiosRequestConfig {
    url?: string;
    method?: string;
    baseURL?: string;
    headers?: AxiosRequestHeaders;
    params?: any;
    data?: any;
    timeout?: number;
    withCredentials?: boolean;
    responseType?: ResponseType;
    validateStatus?: (status: number) => boolean;
  }

  export interface InternalAxiosRequestConfig extends AxiosRequestConfig {
    headers: AxiosRequestHeaders;
  }

  export interface AxiosResponse<T = any> {
    data: T;
    status: number;
    statusText: string;
    headers: Record<string, string>;
    config: AxiosRequestConfig;
  }

  export interface AxiosError<T = any> extends Error {
    config: AxiosRequestConfig;
    code?: string;
    request?: any;
    response?: AxiosResponse<T>;
    isAxiosError: boolean;
  }

  export interface AxiosRequestTransformer {
    (data: any, headers?: Record<string, string>): any;
  }

  export interface AxiosResponseTransformer {
    (data: any, headers?: Record<string, string>): any;
  }

  export interface AxiosDefaults extends AxiosRequestConfig {
    headers: {
      common: Record<string, string>;
      delete: Record<string, string>;
      get: Record<string, string>;
      head: Record<string, string>;
      post: Record<string, string>;
      put: Record<string, string>;
      patch: Record<string, string>;
    };
  }

  export interface AxiosInstance {
    defaults: AxiosDefaults;
    interceptors: {
      request: AxiosInterceptorManager<InternalAxiosRequestConfig>;
      response: AxiosInterceptorManager<AxiosResponse>;
    };
    getUri(config?: AxiosRequestConfig): string;
    request<T = any, R = AxiosResponse<T>>(config: AxiosRequestConfig): Promise<R>;
    get<T = any, R = AxiosResponse<T>>(url: string, config?: AxiosRequestConfig): Promise<R>;
    delete<T = any, R = AxiosResponse<T>>(url: string, config?: AxiosRequestConfig): Promise<R>;
    head<T = any, R = AxiosResponse<T>>(url: string, config?: AxiosRequestConfig): Promise<R>;
    post<T = any, R = AxiosResponse<T>>(url: string, data?: any, config?: AxiosRequestConfig): Promise<R>;
    put<T = any, R = AxiosResponse<T>>(url: string, data?: any, config?: AxiosRequestConfig): Promise<R>;
    patch<T = any, R = AxiosResponse<T>>(url: string, data?: any, config?: AxiosRequestConfig): Promise<R>;
  }

  export interface AxiosInterceptorManager<V> {
    use(onFulfilled?: (value: V) => V | Promise<V>, onRejected?: (error: any) => any): number;
    eject(id: number): void;
  }

  export interface AxiosStatic extends AxiosInstance {
    create(config?: AxiosRequestConfig): AxiosInstance;
    Cancel: CancelStatic;
    CancelToken: CancelTokenStatic;
    isCancel(value: any): boolean;
    all<T>(values: (T | Promise<T>)[]): Promise<T[]>;
    spread<T, R>(callback: (...args: T[]) => R): (array: T[]) => R;
  }

  export interface Cancel {
    message: string;
  }

  export interface CancelToken {
    promise: Promise<Cancel>;
    reason?: Cancel;
    throwIfRequested(): void;
  }

  export interface CancelTokenStatic {
    new (executor: (cancel: (message?: string) => void) => void): CancelToken;
    source(): CancelTokenSource;
  }

  export interface CancelTokenSource {
    token: CancelToken;
    cancel: (message?: string) => void;
  }

  export interface CancelStatic {
    new (message?: string): Cancel;
  }

  declare const axios: AxiosStatic;
  export default axios;
}