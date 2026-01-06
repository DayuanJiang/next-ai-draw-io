// Settings page JavaScript
// This file handles the UI interactions for the settings window

let presets = []
let currentPresetId = null
let editingPresetId = null
let deletingPresetId = null

// DOM Elements
const presetList = document.getElementById("preset-list")
const addPresetBtn = document.getElementById("add-preset-btn")
const presetModal = document.getElementById("preset-modal")
const deleteModal = document.getElementById("delete-modal")
const presetForm = document.getElementById("preset-form")
const modalTitle = document.getElementById("modal-title")
const toast = document.getElementById("toast")

// Form fields
const presetIdField = document.getElementById("preset-id")
const presetNameField = document.getElementById("preset-name")
const aiProviderField = document.getElementById("ai-provider")
const aiModelField = document.getElementById("ai-model")
const aiApiKeyField = document.getElementById("ai-api-key")
const aiBaseUrlField = document.getElementById("ai-base-url")
const temperatureField = document.getElementById("temperature")

// Buttons
const cancelBtn = document.getElementById("cancel-btn")
const saveBtn = document.getElementById("save-btn")
const deleteCancelBtn = document.getElementById("delete-cancel-btn")
const deleteConfirmBtn = document.getElementById("delete-confirm-btn")

// Initialize
document.addEventListener("DOMContentLoaded", async () => {
    await loadPresets()
    setupEventListeners()
})

// Load presets from main process
async function loadPresets() {
    try {
        presets = await window.settingsAPI.getPresets()
        currentPresetId = await window.settingsAPI.getCurrentPresetId()
        renderPresets()
    } catch (error) {
        console.error("Failed to load presets:", error)
        showToast("Failed to load presets", "error")
    }
}

// Render presets list
function renderPresets() {
    if (presets.length === 0) {
        presetList.innerHTML = `
            <div class="empty-state">
                <p>No presets configured yet.</p>
                <p>Add a preset to quickly switch between different AI configurations.</p>
            </div>
        `
        return
    }

    presetList.innerHTML = presets
        .map((preset) => {
            const isActive = preset.id === currentPresetId
            const providerLabel = getProviderLabel(preset.config.AI_PROVIDER)

            return `
            <div class="preset-card ${isActive ? "active" : ""}" data-id="${preset.id}">
                <div class="preset-header">
                    <span class="preset-name">${escapeHtml(preset.name)}</span>
                    ${isActive ? '<span class="preset-badge">Active</span>' : ""}
                </div>
                <div class="preset-info">
                    ${providerLabel ? `Provider: ${providerLabel}` : "No provider configured"}
                    ${preset.config.AI_MODEL ? ` • Model: ${escapeHtml(preset.config.AI_MODEL)}` : ""}
                </div>
                <div class="preset-actions">
                    ${!isActive ? `<button class="btn btn-primary btn-sm apply-btn" data-id="${preset.id}">Apply</button>` : ""}
                    <button class="btn btn-secondary btn-sm edit-btn" data-id="${preset.id}">Edit</button>
                    <button class="btn btn-secondary btn-sm delete-btn" data-id="${preset.id}">Delete</button>
                </div>
            </div>
        `
        })
        .join("")

    // Add event listeners to buttons
    presetList.querySelectorAll(".apply-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation()
            applyPreset(btn.dataset.id)
        })
    })

    presetList.querySelectorAll(".edit-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation()
            openEditModal(btn.dataset.id)
        })
    })

    presetList.querySelectorAll(".delete-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation()
            openDeleteModal(btn.dataset.id)
        })
    })
}

// Setup event listeners
function setupEventListeners() {
    addPresetBtn.addEventListener("click", () => openAddModal())
    cancelBtn.addEventListener("click", () => closeModal())
    saveBtn.addEventListener("click", () => savePreset())
    deleteCancelBtn.addEventListener("click", () => closeDeleteModal())
    deleteConfirmBtn.addEventListener("click", () => confirmDelete())

    // Close modal on overlay click
    presetModal.addEventListener("click", (e) => {
        if (e.target === presetModal) closeModal()
    })
    deleteModal.addEventListener("click", (e) => {
        if (e.target === deleteModal) closeDeleteModal()
    })

    // Handle Enter key in form
    presetForm.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault()
            savePreset()
        }
    })
}

// Open add modal
function openAddModal() {
    editingPresetId = null
    modalTitle.textContent = "Add Preset"
    presetForm.reset()
    presetIdField.value = ""
    presetModal.classList.add("show")
    presetNameField.focus()
}

// Open edit modal
function openEditModal(id) {
    const preset = presets.find((p) => p.id === id)
    if (!preset) return

    editingPresetId = id
    modalTitle.textContent = "Edit Preset"

    presetIdField.value = preset.id
    presetNameField.value = preset.name
    aiProviderField.value = preset.config.AI_PROVIDER || ""
    aiModelField.value = preset.config.AI_MODEL || ""
    aiApiKeyField.value = preset.config.AI_API_KEY || ""
    aiBaseUrlField.value = preset.config.AI_BASE_URL || ""
    temperatureField.value = preset.config.TEMPERATURE || ""

    presetModal.classList.add("show")
    presetNameField.focus()
}

// Close modal
function closeModal() {
    presetModal.classList.remove("show")
    editingPresetId = null
}

// Open delete modal
function openDeleteModal(id) {
    const preset = presets.find((p) => p.id === id)
    if (!preset) return

    deletingPresetId = id
    document.getElementById("delete-preset-name").textContent = preset.name
    deleteModal.classList.add("show")
}

// Close delete modal
function closeDeleteModal() {
    deleteModal.classList.remove("show")
    deletingPresetId = null
}

// Save preset
async function savePreset() {
    const name = presetNameField.value.trim()
    if (!name) {
        showToast("Please enter a preset name", "error")
        presetNameField.focus()
        return
    }

    const preset = {
        id: editingPresetId || undefined,
        name: name,
        config: {
            AI_PROVIDER: aiProviderField.value || undefined,
            AI_MODEL: aiModelField.value.trim() || undefined,
            AI_API_KEY: aiApiKeyField.value.trim() || undefined,
            AI_BASE_URL: aiBaseUrlField.value.trim() || undefined,
            TEMPERATURE: temperatureField.value.trim() || undefined,
        },
    }

    // Remove undefined values
    Object.keys(preset.config).forEach((key) => {
        if (preset.config[key] === undefined) {
            delete preset.config[key]
        }
    })

    try {
        saveBtn.disabled = true
        saveBtn.innerHTML = '<span class="loading"></span>'

        await window.settingsAPI.savePreset(preset)
        await loadPresets()
        closeModal()
        showToast(
            editingPresetId ? "Preset updated" : "Preset created",
            "success",
        )
    } catch (error) {
        console.error("Failed to save preset:", error)
        showToast("Failed to save preset", "error")
    } finally {
        saveBtn.disabled = false
        saveBtn.textContent = "Save"
    }
}

// Confirm delete
async function confirmDelete() {
    if (!deletingPresetId) return

    try {
        deleteConfirmBtn.disabled = true
        deleteConfirmBtn.innerHTML = '<span class="loading"></span>'

        await window.settingsAPI.deletePreset(deletingPresetId)
        await loadPresets()
        closeDeleteModal()
        showToast("Preset deleted", "success")
    } catch (error) {
        console.error("Failed to delete preset:", error)
        showToast("Failed to delete preset", "error")
    } finally {
        deleteConfirmBtn.disabled = false
        deleteConfirmBtn.textContent = "Delete"
    }
}

// Apply preset
async function applyPreset(id) {
    try {
        const btn = presetList.querySelector(`.apply-btn[data-id="${id}"]`)
        if (btn) {
            btn.disabled = true
            btn.innerHTML = '<span class="loading"></span>'
        }

        const result = await window.settingsAPI.applyPreset(id)
        if (result.success) {
            currentPresetId = id
            renderPresets()
            showToast("Preset applied, server restarting...", "success")
        } else {
            showToast(result.error || "Failed to apply preset", "error")
        }
    } catch (error) {
        console.error("Failed to apply preset:", error)
        showToast("Failed to apply preset", "error")
    }
}

// Get provider display label
function getProviderLabel(provider) {
    const labels = {
        openai: "OpenAI",
        anthropic: "Anthropic",
        google: "Google AI",
        azure: "Azure OpenAI",
        bedrock: "AWS Bedrock",
        openrouter: "OpenRouter",
        deepseek: "DeepSeek",
        siliconflow: "SiliconFlow",
        modelscope: "ModelScope",
        ollama: "Ollama",
    }
    return labels[provider] || provider
}

// Show toast notification
function showToast(message, type = "") {
    toast.textContent = message
    toast.className = "toast show" + (type ? ` ${type}` : "")

    setTimeout(() => {
        toast.classList.remove("show")
    }, 3000)
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement("div")
    div.textContent = text
    return div.innerHTML
}
