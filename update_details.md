# Update Details

**Generated:** 2026-03-18 14:35:00 (Asia/Shanghai Timezone)

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
- Added `custom: null` to `PROVIDER_ENV_VARS` Record (custom providers don't use server-side env vars)

**Lines Added:** 1

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

---

## Verification

- **TypeScript Compilation:** ✅ Passed
- **Biome Lint:** ✅ Passed (153 files checked, no issues)
- **Build:** ✅ Passed

---

## Files Modified

| File | Changes |
|------|---------|
| `lib/types/model-config.ts` | +6 lines |
| `lib/ai-providers.ts` | +1 line |
| **Total** | **+7 lines** |
