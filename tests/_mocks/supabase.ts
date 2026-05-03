import { vi } from 'vitest'

export interface MockUser {
  id: string
  email?: string
}

interface MockState {
  user: MockUser | null
}

export const mockState: MockState = { user: null }

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn(async () => ({ data: { user: mockState.user } })),
      signOut: vi.fn(async () => ({ error: null })),
    },
  })),
}))

export function setMockUser(user: MockUser | null) {
  mockState.user = user
}

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`) }),
}))
