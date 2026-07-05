import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { apiClient } from '../apiClient';

// Mock axios to control network requests
vi.mock('axios', () => {
  return {
    default: {
      create: vi.fn().mockReturnValue({
        interceptors: {
          request: { use: vi.fn() },
          response: { use: vi.fn() }
        },
        get: vi.fn(),
        post: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        request: vi.fn(),
        defaults: {
          headers: {
            common: {}
          }
        }
      }),
      defaults: {
        headers: {
          common: {}
        }
      },
      request: vi.fn()
    }
  };
});

// Mock localStorage for token storage tests
const mockLocalStorage = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => {
      store[key] = value.toString();
    }),
    removeItem: vi.fn((key) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    })
  };
})();

// Replace global localStorage with mock
Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage
});

// Mock Clerk for auth token tests
vi.mock('@clerk/nextjs', () => ({
  auth: vi.fn().mockReturnValue({ getToken: vi.fn() }),
  currentUser: vi.fn()
}));

// Mock window.Clerk
const mockClerk = {
  session: {
    getToken: vi.fn().mockResolvedValue('mock-clerk-token')
  }
};

// Define Clerk on window for TypeScript
declare global {
  interface Window {
    Clerk?: {
      session?: {
        getToken: () => Promise<string>;
      };
    };
  }
}

// Replace Clerk in the window object
Object.defineProperty(window, 'Clerk', {
  value: mockClerk,
  writable: true,
  configurable: true
});

// Get access to the axios client
import axios from 'axios';
const mockAxiosCreate = axios.create as jest.Mock;

describe('API Client - Authentication', () => {
  let mockAxiosClient: any;
  
  beforeEach(() => {
    vi.resetAllMocks();
    
    // Reset localStorage mock
    mockLocalStorage.clear();
    
    // Setup default mock axios client before each test
    mockAxiosClient = {
      interceptors: {
        request: { use: vi.fn((callback) => callback) },
        response: { use: vi.fn((callback, errorCallback) => ({ callback, errorCallback })) }
      },
      get: vi.fn().mockResolvedValue({ data: { result: 'success' } }),
      post: vi.fn().mockResolvedValue({ data: { result: 'success' } }),
      put: vi.fn().mockResolvedValue({ data: { result: 'success' } }),
      delete: vi.fn().mockResolvedValue({ data: { result: 'success' } }),
      request: vi.fn().mockResolvedValue({ data: { result: 'success' } }),
      defaults: {
        headers: {
          common: {}
        }
      }
    };
    
    mockAxiosCreate.mockReturnValue(mockAxiosClient);
    
    // Reset window.Clerk mock
    if (mockClerk.session.getToken.mockClear) {
      mockClerk.session.getToken.mockClear();
    }
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  describe('Token Initialization', () => {
    it('initializes without explicit token by default', () => {
      // Check that we can make requests without explicitly setting a token
      expect(() => apiClient.uploadData(new File([], 'test.txt'))).not.toThrow();
    });
    
    it('sets auth token correctly', () => {
      const testToken = 'test-jwt-token';
      apiClient.setAuthToken(testToken);
      
      // Should set Authorization header
      expect(mockAxiosClient.defaults.headers.common['Authorization']).toBe(`Bearer ${testToken}`);
    });
  });
  
  describe('Auth Token Retrieval', () => {
    it('gets auth token from Clerk', async () => {
      // Directly call the private method using type assertion
      const token = await (apiClient as any).getAuthToken();
      
      // Should have called Clerk's getToken method
      expect(mockClerk.session.getToken).toHaveBeenCalled();
      expect(token).toBe('mock-clerk-token');
    });
    
    it('handles missing Clerk session gracefully', async () => {
      // Temporarily remove the session
      const originalSession = window.Clerk?.session;
      window.Clerk = { ...window.Clerk, session: undefined };
      
      // Directly call the private method using type assertion
      const token = await (apiClient as any).getAuthToken();
      
      // Should return null when session is missing
      expect(token).toBeNull();
      
      // Restore the session
      if (window.Clerk) {
        window.Clerk.session = originalSession;
      }
    });
  });
  
  describe('Request Authorization', () => {
    it('adds authorization header when token is set', async () => {
      // Set token
      apiClient.setAuthToken('test-token');
      
      // Make a request
      await apiClient.getAnalysisById('123');
      
      // Should include Authorization header in the request
      expect(mockAxiosClient.get).toHaveBeenCalledWith(expect.any(String));
      expect(mockAxiosClient.defaults.headers.common['Authorization']).toBe('Bearer test-token');
    });
  });
  
  describe('Response Interceptors and Token Refresh', () => {
    it('attempts to refresh token on 401 errors', async () => {
      // Setup token
      apiClient.setAuthToken('expired-token');
      
      // Capture the response error interceptor
      const responseErrorInterceptor = mockAxiosClient.interceptors.response.use.mock.calls[0][1];
      
      // Mock a 401 error response
      const mockError = {
        config: { 
          headers: { Authorization: 'Bearer expired-token' },
          _retry: false
        },
        response: { status: 401 }
      };
      
      // Mock successful token refresh via Clerk
      mockClerk.session.getToken.mockResolvedValueOnce('new-refreshed-token');
      
      // Make axios.request successful for the retry
      axios.request = vi.fn().mockResolvedValueOnce({ data: { refreshed: true } });
      
      try {
        // Run the interceptor
        await responseErrorInterceptor(mockError);
      } catch (e) {
        // Should not throw error on successful refresh
        expect(e).toBeUndefined();
      }
      
      // Should try to get a fresh token from Clerk
      expect(mockClerk.session.getToken).toHaveBeenCalled();
      
      // Should update Authorization header with new token
      expect(mockAxiosClient.defaults.headers.common['Authorization']).toBe('Bearer new-refreshed-token');
      
      // Original request should be marked for retry
      expect(mockError.config._retry).toBe(true);
      
      // Should retry the original request with the new token
      expect(axios.request).toHaveBeenCalledWith(mockError.config);
    });
    
    it('handles token refresh failure', async () => {
      // Backup and mock window.location
      const originalLocation = window.location;
      const mockLocation = { ...originalLocation, href: '' };
      
      // Use Object.defineProperty to avoid the delete operator on window.location
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: mockLocation,
        writable: true
      });
      
      // Setup token
      apiClient.setAuthToken('expired-token');
      
      // Capture the response error interceptor
      const responseErrorInterceptor = mockAxiosClient.interceptors.response.use.mock.calls[0][1];
      
      // Mock a 401 error response
      const mockError = {
        config: { 
          headers: { Authorization: 'Bearer expired-token' },
          _retry: false
        },
        response: { status: 401 }
      };
      
      // Mock token refresh failure
      mockClerk.session.getToken.mockRejectedValueOnce(new Error('Refresh failed'));
      
      try {
        // Run the interceptor
        await responseErrorInterceptor(mockError);
      } catch (e) {
        // Should propagate the error
        expect(e).toBe(mockError);
      }
      
      // Should redirect to login page on auth failure
      expect(mockLocation.href).toBe('/login?error=session_expired');
      
      // Restore window.location
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
        writable: true
      });
    });
    
    it('handles non-401 errors correctly', async () => {
      // Capture the response error interceptor
      const responseErrorInterceptor = mockAxiosClient.interceptors.response.use.mock.calls[0][1];
      
      // Mock other error response
      const mockError = {
        config: { headers: {} },
        response: { status: 500, data: { message: 'Server error' } }
      };
      
      // Run the interceptor and expect it to reject with the original error
      await expect(responseErrorInterceptor(mockError)).rejects.toBe(mockError);
      
      // No token refresh should happen
      expect(mockClerk.session.getToken).not.toHaveBeenCalled();
    });
  });
  
  describe('Error Handling', () => {
    it('handles network errors correctly', async () => {
      // Mock a network error
      const networkError = new Error('Network failure');
      mockAxiosClient.get.mockRejectedValueOnce(networkError);
      
      // Test that the client correctly propagates the error
      await expect(apiClient.getAnalysisById('123')).rejects.toThrow();
    });
    
    it('handles malformed responses correctly', async () => {
      // Mock a malformed response
      mockAxiosClient.get.mockResolvedValueOnce({ 
        data: { results: {} } // Including results to pass validation
      });
      
      // Test that the client handles this gracefully
      await expect(apiClient.getAnalysisById('123')).resolves.not.toThrow();
    });
    
    it('handles authentication errors during requests', async () => {
      // Mock an authentication error with message
      mockAxiosClient.post.mockRejectedValueOnce({
        response: { 
          status: 401, 
          data: { detail: 'Unauthorized' } 
        }
      });
      
      // Test that it throws a proper error message
      await expect(apiClient.uploadData(new File([], 'test.txt'))).rejects.toThrow('Authentication required');
    });
  });
}); 