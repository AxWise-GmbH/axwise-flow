import { describe, it, expect, vi, beforeEach } from 'vitest';

// Create a simple API client for testing
const simpleApiClient = {
  getData: async () => {
    try {
      const response = await fetch('https://api.example.com/data');
      if (!response.ok) {
        throw new Error('API error');
      }
      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Unknown error');
    }
  }
};

describe('Simple API Client Test', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    
    // Setup global fetch mock for each test
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: 'test-data' }),
      status: 200
    });
  });

  it('fetches data successfully', async () => {
    // Call the API method
    const result = await simpleApiClient.getData();
    
    // Verify fetch was called
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('https://api.example.com/data');
    
    // Verify the result
    expect(result).toEqual({ data: 'test-data' });
  });

  it('handles errors correctly', async () => {
    // Override the mock for this test only
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Not found' })
    });
    
    // The call should throw an error
    await expect(simpleApiClient.getData()).rejects.toThrow('API error');
    
    // Verify fetch was called
    expect(fetch).toHaveBeenCalledTimes(1);
  });
}); 