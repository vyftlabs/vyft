import type { BrowserContext } from "@playwright/test"

export const TEST_ADMIN = {
    email: "admin@test.local",
    password: "test-password-123",
}

/**
 * Signs in the seeded admin user and stores the session cookie on the
 * browser context so subsequent page navigations are authenticated.
 */
export async function loginAsAdmin(context: BrowserContext, baseURL = "http://localhost:3000"): Promise<void> {
    const res = await context.request.post(`${baseURL}/api/auth/sign-in/email`, {
        data: { email: TEST_ADMIN.email, password: TEST_ADMIN.password },
    })
    if (!res.ok()) {
        throw new Error(`sign-in failed (${res.status()}): ${await res.text()}`)
    }
}
