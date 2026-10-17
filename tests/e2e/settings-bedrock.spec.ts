// Bedrock in the settings: an API key or AWS access keys, one at a time
import {
    changeInAnotherTab,
    expect,
    openApp,
    openSettings,
    savedModelConfigs,
    settingsDialog,
    test,
} from "./lib/fixtures"

test("Bedrock shows one way of signing in and empties the other", async ({
    page,
}) => {
    await openApp(page, {
        config: {
            version: 1,
            providers: [
                {
                    id: "b1",
                    provider: "bedrock",
                    apiKey: "bedrock-key",
                    awsRegion: "us-east-1",
                    // Left by an older version: belongs to the access keys
                    awsSessionToken: "session-token",
                    models: [
                        {
                            id: "m1",
                            modelId: "amazon.nova-lite-v1:0",
                            validated: true,
                        },
                    ],
                },
            ],
        },
    })
    await openSettings(page)
    const dialog = settingsDialog(page)
    await dialog.getByTestId("provider-row-b1").click()
    await expect(dialog.getByLabel("Bedrock API key")).toHaveValue(
        "bedrock-key",
    )
    await expect(dialog.locator("#aws-access-key-id")).toHaveCount(0)

    await dialog
        .getByRole("button", { name: "Access keys", exact: true })
        .click()
    await expect(dialog.locator("#bedrock-api-key")).toHaveCount(0)
    // The key that was tested is gone, and so is its test result
    await expect
        .poll(
            async () =>
                (await savedModelConfigs(page)).providers[0].models[0]
                    .validated,
        )
        .toBeUndefined()
    await dialog.locator("#aws-access-key-id").fill("AKIATEST")
    await dialog.locator("#aws-secret-access-key").fill("secret")
    await expect
        .poll(async () => (await savedModelConfigs(page)).providers[0])
        .toMatchObject({
            apiKey: "",
            awsAccessKeyId: "AKIATEST",
            awsSecretAccessKey: "secret",
        })
    // Reopened, it shows the way that is filled in
    await page.keyboard.press("Escape")
    await openSettings(page)
    await dialog.getByTestId("provider-row-b1").click()
    await expect(
        dialog.getByRole("button", { name: "Access keys", exact: true }),
    ).toHaveAttribute("aria-pressed", "true")

    await dialog
        .getByRole("button", { name: "Bedrock API key", exact: true })
        .click()
    await expect
        .poll(async () => (await savedModelConfigs(page)).providers[0])
        .toMatchObject({
            awsAccessKeyId: "",
            awsSecretAccessKey: "",
            awsSessionToken: "",
        })
})

test("switching Bedrock's sign-in with nothing filled in keeps the test results", async ({
    page,
}) => {
    // Older configs may hold a result without the key that earned it
    await openApp(page, {
        config: {
            version: 1,
            providers: [
                {
                    id: "b1",
                    provider: "bedrock",
                    apiKey: "",
                    awsRegion: "us-east-1",
                    models: [
                        {
                            id: "m1",
                            modelId: "amazon.nova-lite-v1:0",
                            validated: true,
                        },
                    ],
                },
            ],
        },
    })
    await openSettings(page)
    const dialog = settingsDialog(page)
    await dialog.getByTestId("provider-row-b1").click()
    await dialog
        .getByRole("button", { name: "Access keys", exact: true })
        .click()
    await expect(dialog.locator("#aws-access-key-id")).toBeVisible()
    await page.waitForTimeout(300)
    expect(
        (await savedModelConfigs(page)).providers[0].models[0].validated,
    ).toBe(true)
})

test("Bedrock shows the sign-in that is saved, also after another tab", async ({
    page,
}) => {
    await openApp(page, {
        config: {
            version: 1,
            providers: [
                {
                    id: "b1",
                    provider: "bedrock",
                    apiKey: "",
                    awsAccessKeyId: "AKIAOLD",
                    awsSecretAccessKey: "old-secret",
                    awsRegion: "us-east-1",
                    models: [{ id: "m1", modelId: "amazon.nova-lite-v1:0" }],
                },
            ],
        },
    })
    await openSettings(page)
    const dialog = settingsDialog(page)
    await dialog.getByTestId("provider-row-b1").click()
    await expect(dialog.locator("#aws-access-key-id")).toHaveValue("AKIAOLD")
    // Another tab signs the provider in with an API key instead
    await changeInAnotherTab(page, (config) => {
        config.providers[0].apiKey = "bedrock-key"
        config.providers[0].awsAccessKeyId = ""
        config.providers[0].awsSecretAccessKey = ""
    })
    await expect(dialog.locator("#bedrock-api-key")).toHaveValue("bedrock-key")
    await expect(dialog.locator("#aws-access-key-id")).toHaveCount(0)
})

test("emptying Bedrock's access keys to type new ones keeps their fields", async ({
    page,
}) => {
    await openApp(page, {
        config: {
            version: 1,
            providers: [
                {
                    id: "b1",
                    provider: "bedrock",
                    apiKey: "",
                    awsAccessKeyId: "AKIAOLD",
                    awsSecretAccessKey: "old-secret",
                    awsRegion: "us-east-1",
                    models: [{ id: "m1", modelId: "amazon.nova-lite-v1:0" }],
                },
            ],
        },
    })
    await openSettings(page)
    const dialog = settingsDialog(page)
    await dialog.getByTestId("provider-row-b1").click()
    await dialog.locator("#aws-secret-access-key").fill("")
    await dialog.locator("#aws-access-key-id").fill("")
    await expect(dialog.locator("#bedrock-api-key")).toHaveCount(0)
    await dialog.locator("#aws-access-key-id").fill("AKIANEW")
    await expect
        .poll(async () => (await savedModelConfigs(page)).providers[0])
        .toMatchObject({ apiKey: "", awsAccessKeyId: "AKIANEW" })
})

test("refused access keys are named as such", async ({ page }) => {
    await page.route("**/api/validate-model", (route) =>
        route.fulfill({
            json: { valid: false, code: "invalid_api_key", error: "Bad keys" },
        }),
    )
    await openApp(page, {
        config: {
            version: 1,
            providers: [
                {
                    id: "b1",
                    provider: "bedrock",
                    apiKey: "",
                    awsAccessKeyId: "AKIA1",
                    awsSecretAccessKey: "s",
                    awsRegion: "us-east-1",
                    models: [{ id: "m1", modelId: "amazon.nova-lite-v1:0" }],
                },
            ],
        },
    })
    await openSettings(page)
    const dialog = settingsDialog(page)
    await dialog.getByTestId("provider-row-b1").click()
    await dialog.getByTestId("test-models").click()
    await expect(
        dialog.getByText(
            "AWS rejected these access keys. They may be mistyped, deactivated, deleted, or from another account. Provider says: Bad keys",
        ),
    ).toBeVisible()
    for (const id of ["#aws-access-key-id", "#aws-secret-access-key"]) {
        await expect(dialog.locator(id)).toHaveAttribute("aria-invalid", "true")
    }
})

test("temporary Bedrock access keys can carry their session token", async ({
    page,
}) => {
    const bodies: any[] = []
    await page.route("**/api/validate-model", async (route) => {
        bodies.push(route.request().postDataJSON())
        await route.fulfill({ json: { valid: true, responseTime: 900 } })
    })
    await openApp(page, {
        config: {
            version: 1,
            providers: [
                {
                    id: "b1",
                    provider: "bedrock",
                    apiKey: "",
                    awsAccessKeyId: "ASIATEMP",
                    awsSecretAccessKey: "secret",
                    awsRegion: "us-east-1",
                    models: [{ id: "m1", modelId: "amazon.nova-lite-v1:0" }],
                },
            ],
        },
    })
    await openSettings(page)
    const dialog = settingsDialog(page)
    await dialog.getByTestId("provider-row-b1").click()
    await dialog.getByLabel("AWS session token (optional)").fill("session-1")
    await dialog.getByTestId("test-models").click()
    await expect.poll(() => bodies.length).toBe(1)
    expect(bodies[0]).toMatchObject({
        awsAccessKeyId: "ASIATEMP",
        awsSessionToken: "session-1",
    })
    expect((await savedModelConfigs(page)).providers[0].awsSessionToken).toBe(
        "session-1",
    )
})

test("Bedrock with both kinds of credentials offers to remove the access keys", async ({
    page,
}) => {
    await openApp(page, {
        config: {
            version: 1,
            providers: [
                {
                    id: "b1",
                    provider: "bedrock",
                    apiKey: "bedrock-key",
                    awsAccessKeyId: "AKIAOLD",
                    awsSecretAccessKey: "old-secret",
                    awsSessionToken: "old-token",
                    awsRegion: "us-east-1",
                    models: [{ id: "m1", modelId: "amazon.nova-lite-v1:0" }],
                },
            ],
        },
    })
    await openSettings(page)
    const dialog = settingsDialog(page)
    await dialog.getByTestId("provider-row-b1").click()
    const notice = dialog.getByText(/also keeps an access key pair/)
    await expect(notice).toBeVisible()
    await dialog.getByRole("button", { name: "Remove the access keys" }).click()
    await expect(notice).toHaveCount(0)
    await expect
        .poll(async () => (await savedModelConfigs(page)).providers[0])
        .toMatchObject({
            apiKey: "bedrock-key",
            awsAccessKeyId: "",
            awsSecretAccessKey: "",
            awsSessionToken: "",
        })
    await expect(dialog.locator("#bedrock-api-key")).toHaveValue("bedrock-key")
})

test("removing access keys kept behind an API key keeps the test results", async ({
    page,
}) => {
    await openApp(page, {
        config: {
            version: 1,
            providers: [
                {
                    id: "b1",
                    provider: "bedrock",
                    apiKey: "bedrock-key",
                    awsAccessKeyId: "AKIAOLD",
                    awsSecretAccessKey: "old-secret",
                    awsRegion: "us-east-1",
                    models: [
                        {
                            id: "m1",
                            modelId: "amazon.nova-lite-v1:0",
                            validated: true,
                        },
                    ],
                },
            ],
        },
    })
    await openSettings(page)
    const dialog = settingsDialog(page)
    await dialog.getByTestId("provider-row-b1").click()
    await dialog.getByRole("button", { name: "Remove the access keys" }).focus()
    await page.keyboard.press("Enter")
    await expect
        .poll(
            async () =>
                (await savedModelConfigs(page)).providers[0].awsAccessKeyId,
        )
        .toBe("")
    // The API key was the one in use: its result still holds
    expect(
        (await savedModelConfigs(page)).providers[0].models[0].validated,
    ).toBe(true)
    await expect(dialog.locator("#bedrock-api-key")).toBeFocused()
})
