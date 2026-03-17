# Update Details

**Generated:** 2026-03-18 14:35:00 (Asia/Shanghai Timezone)  
**Last Updated:** 2026-03-18 16:00:00 (Asia/Shanghai Timezone)

---

## Summary

Added custom model provider support to allow users to configure their own AI model providers with custom Base URL and API key.

---

## Changes Made

### 1. lib/types/model-config.ts

**File:** `F:\VsCode_projects\next-ai-draw-io\lib\types\model-config.ts`

**Changes:**
- Added `"custom"` to `ProviderName` type union
- Added `custom: "openai"` to `PROVIDER_LOGO_MAP` (uses OpenAI logo for custom providers)
- Added `custom: { label: "Custom Provider" }` to `PROVIDER_INFO` metadata
- Added `custom: []` to `SUGGESTED_MODELS` (no pre-defined models for custom provider)

**Lines Added:** 6

---

### 2. lib/ai-providers.ts

**File:** `F:\VsCode_projects\next-ai-draw-io\lib\ai-providers.ts`

**Changes:**

1. **PROVIDER_ENV_VARS** - Added `custom: null` (custom providers don't use server-side env vars)

2. **ALLOWED_CLIENT_PROVIDERS** - Added `"custom"` to allow client-side provider selection

3. **getAIModel switch statement** - Added `"custom"` case for chat API initialization:
```typescript
case "custom": {
    // Custom provider - requires baseUrl from client, uses OpenAI-compatible API
    const apiKey = overrides?.apiKey
    const baseURL = overrides?.baseUrl

    if (!baseURL) {
        throw new Error(
            "Custom provider requires a base URL. Please configure it in Settings.",
        )
    }

    if (!apiKey) {
        throw new Error(
            "Custom provider requires an API key. Please configure it in Settings.",
        )
    }

    const customProvider = createOpenAI({
        apiKey,
        baseURL,
    })
    model = customProvider.chat(modelId)
    break
}
```

**Lines Added:** ~20 lines

---

### 3. app/api/validate-model/route.ts

**File:** `F:\VsCode_projects\next-ai-draw-io\app\api\validate-model\route.ts`

**Changes:**
- Added `"custom"` case in the provider switch statement to handle validation for custom providers
- Custom providers require a Base URL (enforced at validation)
- Uses OpenAI-compatible API for validation

**Lines Added:** 14

**Code added:**
```typescript
case "custom": {
    // Custom provider - requires baseUrl, uses OpenAI-compatible API
    if (!baseUrl) {
        return NextResponse.json(
            { valid: false, error: "Base URL is required for custom provider" },
            { status: 400 },
        )
    }
    const openai = createOpenAI({
        apiKey,
        baseURL: baseUrl,
    })
    model = openai.chat(modelId)
    break
}
```

---

## Feature Description

### Custom Provider Functionality

Users can now add a custom AI model provider by:

1. Opening the AI Model Configuration dialog
2. Clicking "Add Provider" dropdown
3. Selecting **"Custom Provider"** option
4. Configuring the following fields:
   - **Display Name** (optional) - Custom name for the provider
   - **API Key** - User's API key for authentication
   - **Base URL** (required) - Full API endpoint URL (e.g., `https://api.your-provider.com/v1`)
5. Adding model IDs specific to the custom provider

### Technical Details

- Custom providers use OpenAI-compatible API format by default
- The Base URL is required for custom providers (unlike built-in providers which have defaults)
- Configuration is stored locally in the user's browser (same as other user-defined providers)
- Validation is performed via `/api/validate-model` endpoint
- Chat API supports custom providers via `getAIModel` function

### Security Considerations

- **SSRF Protection**: Custom base URLs are checked against private/internal URLs (localhost, 127.0.0.1, private IPs, etc.)
- **API Key Security**: When using custom baseUrl, an API key MUST also be provided (prevents credential leakage)
- **No Server Credentials**: Client provides their own API key - never exposed to server or other endpoints

---

## Verification

- **TypeScript Compilation:** ✅ Passed
- **Biome Lint:** ✅ Passed (153 files checked, no issues)
- **Build:** ✅ Passed

---

## Code Review

Reviewed by Momus (Plan Critic) - **APPROVED**

Key security features verified:
- ✅ SSRF protection applied to custom base URLs
- ✅ API key required when using custom base URL (prevents credential leakage)
- ✅ Private/internal URLs blocked
- ✅ No server credentials exposed to custom endpoints

---

## Files Modified

| File | Changes |
|------|---------|
| `lib/types/model-config.ts` | +6 lines |
| `lib/ai-providers.ts` | +20 lines |
| `app/api/validate-model/route.ts` | +14 lines |
| **Total** | **+40 lines** |
