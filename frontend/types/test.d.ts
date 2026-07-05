/// <reference types="jest" />
/// <reference types="@testing-library/jest-dom" />

declare namespace jest {
  interface Matchers<R> {
    toBeValidDate(): R
    toHaveBeenCalledWithMatch(expected: unknown): R
  }
}

declare global {
  namespace NodeJS {
    interface Global {
      expect: jest.Expect
      describe: jest.Describe
      it: jest.It
      beforeEach: jest.Hook
      afterEach: jest.Hook
      beforeAll: jest.Hook
      afterAll: jest.Hook
      jest: typeof jest
    }
  }

  // Add test utility types
  interface CustomMatchers<R = unknown> {
    toBeValidDate(): R
    toHaveBeenCalledWithMatch(expected: unknown): R
  }

  namespace jest {
    interface Expect extends CustomMatchers {}
    interface InverseAsymmetricMatchers extends CustomMatchers {}
  }
}

// Test helper types
type MockedFunction<T extends (...args: any[]) => any> = jest.Mock<ReturnType<T>, Parameters<T>>

type DeepPartialMock<T> = {
  [P in keyof T]?: T[P] extends (...args: any[]) => any
    ? jest.Mock<ReturnType<T[P]>, Parameters<T[P]>>
    : T[P] extends object
    ? DeepPartialMock<T[P]>
    : T[P]
}

type TestCase<Input = any, Expected = any> = {
  name: string
  input: Input
  expected: Expected
}

// Common test utility types
type RenderResult = import('@testing-library/react').RenderResult
type RenderHookResult<Result, Props> = import('@testing-library/react').RenderHookResult<Result, Props>

// Extend window with test-specific properties
declare global {
  interface Window {
    __TEST__: boolean
  }
}

export {}