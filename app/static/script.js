/**
 * script.js - Frontend controller for Local Image Generation Studio.
 * Handles dynamic model switching, hardware stats polling, and generation lifecycle.
 */

// Global State
let modelCatalog = {};
let activeModelKey = null;
let isGenerating = false;
let isSwitchingModel = false;
let elapsedTimerInterval = null;
let lastGenerationData = null;

// DOM Elements
const elements = {
  // Navigation & Stats
  deviceDot: document.getElementById("device-dot"),
  deviceText: document.getElementById("device-text"),
  vramText: document.getElementById("vram-text"),

  // Model Selector
  modelSelect: document.getElementById("model-select"),
  switchModelBtn: document.getElementById("switch-model-btn"),
  modelTierBadge: document.getElementById("model-tier-badge"),
  modelDesc: document.getElementById("model-description"),

  // Inputs
  promptInput: document.getElementById("prompt-input"),
  promptCount: document.getElementById("prompt-count"),
  negPromptGroup: document.getElementById("negative-prompt-group"),
  negPromptInput: document.getElementById("negative-prompt-input"),
  negPromptTag: document.getElementById("negative-prompt-tag"),

  // Presets & Dimensions
  resPresetsContainer: document.getElementById("resolution-presets"),
  customWidth: document.getElementById("custom-width"),
  customHeight: document.getElementById("custom-height"),

  // Sliders
  stepsSlider: document.getElementById("steps-slider"),
  stepsVal: document.getElementById("steps-val"),
  guidanceSlider: document.getElementById("guidance-slider"),
  guidanceVal: document.getElementById("guidance-val"),
  seedInput: document.getElementById("seed-input"),
  diceBtn: document.getElementById("dice-btn"),
  randomizeSeedBtn: document.getElementById("randomize-seed-btn"),

  // Action
  generateBtn: document.getElementById("generate-btn"),
  generateBtnText: document.getElementById("generate-btn-text"),
  generateSpinner: document.getElementById("generate-spinner"),
  statusDot: document.getElementById("status-dot"),
  statusMessage: document.getElementById("status-message"),
  timerText: document.getElementById("timer-text"),

  // Stage & Preview
  imageStage: document.getElementById("image-stage"),
  placeholderState: document.getElementById("placeholder-state"),
  loadingState: document.getElementById("loading-state"),
  elapsedCounter: document.getElementById("elapsed-counter"),
  mainPreviewImg: document.getElementById("main-preview-img"),
  previewActions: document.getElementById("preview-actions"),
  downloadBtn: document.getElementById("download-btn"),
  copyParamsBtn: document.getElementById("copy-params-btn"),

  // Metadata Strip
  metaStrip: document.getElementById("meta-strip"),
  metaModel: document.getElementById("meta-model"),
  metaRes: document.getElementById("meta-res"),
  metaSteps: document.getElementById("meta-steps"),
  metaCfg: document.getElementById("meta-cfg"),
  metaSeed: document.getElementById("meta-seed"),
  metaTime: document.getElementById("meta-time"),

  // Gallery
  galleryGrid: document.getElementById("gallery-grid"),
  galleryCount: document.getElementById("gallery-count"),
  toastContainer: document.getElementById("toast-container"),
};

// ============================================================================
// Initialization
// ============================================================================
document.addEventListener("DOMContentLoaded", () => {
  setupEventListeners();
  fetchModels();
  fetchHealth();
  fetchRecentImages();

  // Poll hardware status every 6 seconds
  setInterval(fetchHealth, 6000);
});

// ============================================================================
// Event Listeners
// ============================================================================
function setupEventListeners() {
  // Prompt input length counter
  elements.promptInput.addEventListener("input", () => {
    elements.promptCount.textContent = `${elements.promptInput.value.length} chars`;
  });

  // Sliders synchronization
  elements.stepsSlider.addEventListener("input", (e) => {
    elements.stepsVal.textContent = e.target.value;
  });

  elements.guidanceSlider.addEventListener("input", (e) => {
    elements.guidanceVal.textContent = Number(e.target.value).toFixed(1);
  });

  // Seed buttons
  elements.diceBtn.addEventListener("click", () => {
    elements.seedInput.value = -1;
  });
  elements.randomizeSeedBtn.addEventListener("click", () => {
    elements.seedInput.value = -1;
  });

  // Model switch
  elements.switchModelBtn.addEventListener("click", handleModelSwitch);
  elements.modelSelect.addEventListener("change", () => {
    const selectedKey = elements.modelSelect.value;
    if (selectedKey !== activeModelKey) {
      elements.switchModelBtn.classList.add("btn-primary");
      elements.switchModelBtn.classList.remove("btn-secondary");
    } else {
      elements.switchModelBtn.classList.remove("btn-primary");
      elements.switchModelBtn.classList.add("btn-secondary");
    }
  });

  // Generate Image
  elements.generateBtn.addEventListener("click", handleGenerate);

  // Copy parameters
  elements.copyParamsBtn.addEventListener("click", copyGenerationParams);
}

// ============================================================================
// API Calls: Models & Health
// ============================================================================
async function fetchModels() {
  try {
    const res = await fetch("/api/v1/models");
    if (!res.ok) throw new Error("Failed to load models");
    const data = await res.json();

    modelCatalog = data.models || {};
    activeModelKey = data.current_model;

    // Populate dropdown
    elements.modelSelect.innerHTML = "";
    Object.keys(modelCatalog).forEach((key) => {
      const m = modelCatalog[key];
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = `${m.name} (${m.min_vram_gb}GB+ VRAM)`;
      if (key === activeModelKey) opt.selected = true;
      elements.modelSelect.appendChild(opt);
    });

    if (activeModelKey && modelCatalog[activeModelKey]) {
      applyModelPresets(activeModelKey);
    }
  } catch (err) {
    showToast(`Error loading models: ${err.message}`, "error");
  }
}

async function fetchHealth() {
  try {
    const res = await fetch("/api/v1/health");
    if (!res.ok) return;
    const data = await res.json();

    const device = data.device || "cpu";
    elements.deviceDot.className = `stat-dot ${device}`;
    const devName = data.device_name || device.toUpperCase();
    elements.deviceText.textContent = devName;

    if (data.vram && data.vram.total_gb) {
      const used = data.vram.allocated_gb || data.vram.used_gb || 0;
      const total = data.vram.total_gb;
      const pct = Math.round((used / total) * 100);
      elements.vramText.textContent = `${used} / ${total} GB (${pct}%)`;
    } else {
      elements.vramText.textContent = `RAM: ${data.ram.used_gb} / ${data.ram.total_gb} GB`;
    }

    if (data.engine && data.engine.current_model_key && data.engine.current_model_key !== activeModelKey) {
      activeModelKey = data.engine.current_model_key;
      elements.modelSelect.value = activeModelKey;
      applyModelPresets(activeModelKey);
    }
  } catch (e) {
    // Silent fail for polling errors
  }
}

function applyModelPresets(modelKey) {
  const model = modelCatalog[modelKey];
  if (!model) return;

  // Update info badges & description
  elements.modelTierBadge.textContent = model.tier || `${model.min_vram_gb}GB VRAM`;
  elements.modelDesc.innerHTML = `<strong>${model.name}</strong> &bull; ${model.description}`;

  // Sliders default values
  elements.stepsSlider.value = model.default_steps;
  elements.stepsVal.textContent = model.default_steps;

  elements.guidanceSlider.value = model.default_guidance_scale;
  elements.guidanceVal.textContent = Number(model.default_guidance_scale).toFixed(1);

  // Negative prompt support check
  if (model.supports_negative_prompt === false) {
    elements.negPromptInput.disabled = true;
    elements.negPromptInput.value = "";
    elements.negPromptTag.textContent = "Not used by this architecture";
    elements.negPromptGroup.style.opacity = "0.5";
  } else {
    elements.negPromptInput.disabled = false;
    elements.negPromptTag.textContent = "Avoids artifacts";
    elements.negPromptGroup.style.opacity = "1.0";
  }

  // Populate resolution presets
  elements.resPresetsContainer.innerHTML = "";
  const resolutions = model.resolutions || [
    { label: "1:1 (512x512)", width: 512, height: 512 }
  ];

  resolutions.forEach((res, idx) => {
    const pill = document.createElement("button");
    pill.type = "button";
    pill.className = `preset-pill ${idx === 0 ? "active" : ""}`;
    pill.textContent = res.label;
    pill.addEventListener("click", () => {
      document.querySelectorAll(".preset-pill").forEach((p) => p.classList.remove("active"));
      pill.classList.add("active");
      elements.customWidth.value = res.width;
      elements.customHeight.value = res.height;
    });
    elements.resPresetsContainer.appendChild(pill);
  });

  // Set default dimensions
  elements.customWidth.value = model.default_width || 512;
  elements.customHeight.value = model.default_height || 512;
}

// ============================================================================
// Model Switching
// ============================================================================
async function handleModelSwitch() {
  const targetKey = elements.modelSelect.value;
  if (!targetKey || isSwitchingModel || isGenerating) return;

  isSwitchingModel = true;
  setStatus("busy", `Loading model '${targetKey}' (may take a moment to download/initialize)...`);
  elements.switchModelBtn.disabled = true;
  elements.generateBtn.disabled = true;

  try {
    const res = await fetch("/api/v1/switch-model", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model_key: targetKey }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Model switch failed");

    activeModelKey = targetKey;
    applyModelPresets(activeModelKey);
    setStatus("ready", `Active: ${data.model_name} (switched in ${data.switch_time_seconds}s)`);
    showToast(`Loaded ${data.model_name} successfully!`, "success");
    elements.switchModelBtn.classList.remove("btn-primary");
    elements.switchModelBtn.classList.add("btn-secondary");
  } catch (err) {
    setStatus("error", `Switch failed: ${err.message}`);
    showToast(err.message, "error");
  } finally {
    isSwitchingModel = false;
    elements.switchModelBtn.disabled = false;
    elements.generateBtn.disabled = false;
    fetchHealth();
  }
}

// ============================================================================
// Image Generation
// ============================================================================
async function handleGenerate() {
  const prompt = elements.promptInput.value.trim();
  if (!prompt) {
    showToast("Please enter a text prompt to generate.", "error");
    elements.promptInput.focus();
    return;
  }

  if (isGenerating || isSwitchingModel) return;

  isGenerating = true;
  elements.generateBtn.disabled = true;
  elements.generateSpinner.style.display = "inline-block";
  elements.generateBtnText.textContent = "Synthesizing...";
  setStatus("busy", "Inference running on backend...");

  // Show loading canvas state
  elements.placeholderState.style.display = "none";
  elements.mainPreviewImg.style.display = "none";
  elements.loadingState.style.display = "block";
  elements.previewActions.style.display = "none";
  elements.metaStrip.style.display = "none";

  const startTime = Date.now();
  elements.elapsedCounter.textContent = "0.0s";
  elapsedTimerInterval = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    elements.elapsedCounter.textContent = `${elapsed}s`;
    elements.timerText.textContent = `${elapsed}s`;
  }, 100);

  const payload = {
    prompt: prompt,
    negative_prompt: elements.negPromptInput.value.trim(),
    width: parseInt(elements.customWidth.value, 10),
    height: parseInt(elements.customHeight.value, 10),
    num_inference_steps: parseInt(elements.stepsSlider.value, 10),
    guidance_scale: parseFloat(elements.guidanceSlider.value),
    seed: parseInt(elements.seedInput.value, 10),
  };

  try {
    const res = await fetch("/api/v1/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Image generation failed");

    lastGenerationData = data;
    displayGeneratedImage(data);
    addToGallery(data);
    setStatus("ready", `Generated in ${data.generation_time_seconds}s (Seed: ${data.seed})`);
    showToast("Image synthesized successfully!", "success");
  } catch (err) {
    setStatus("error", `Generation failed: ${err.message}`);
    showToast(err.message, "error");
    elements.loadingState.style.display = "none";
    if (lastGenerationData) {
      elements.mainPreviewImg.style.display = "block";
      elements.previewActions.style.display = "flex";
      elements.metaStrip.style.display = "flex";
    } else {
      elements.placeholderState.style.display = "block";
    }
  } finally {
    clearInterval(elapsedTimerInterval);
    isGenerating = false;
    elements.generateBtn.disabled = false;
    elements.generateSpinner.style.display = "none";
    elements.generateBtnText.textContent = "✨ Generate Image";
    fetchHealth();
  }
}

function displayGeneratedImage(data) {
  elements.loadingState.style.display = "none";
  elements.placeholderState.style.display = "none";

  elements.mainPreviewImg.src = data.url;
  elements.mainPreviewImg.style.display = "block";

  // Actions
  elements.downloadBtn.href = data.url;
  elements.downloadBtn.download = data.filename || `diffusion_${data.seed}.png`;
  elements.previewActions.style.display = "flex";

  // Metadata strip
  elements.metaModel.textContent = data.model_name || data.model_key;
  elements.metaRes.textContent = `${data.width}x${data.height}`;
  elements.metaSteps.textContent = data.num_inference_steps;
  elements.metaCfg.textContent = data.guidance_scale;
  elements.metaSeed.textContent = data.seed;
  elements.metaTime.textContent = `${data.generation_time_seconds}s`;
  elements.metaStrip.style.display = "flex";
}

// ============================================================================
// Gallery & History
// ============================================================================
async function fetchRecentImages() {
  try {
    const res = await fetch("/api/v1/images");
    if (!res.ok) return;
    const data = await res.json();
    const images = data.images || [];

    elements.galleryGrid.innerHTML = "";
    images.forEach((img) => {
      createGalleryItem(img.url, img.filename);
    });
    elements.galleryCount.textContent = `${images.length} images`;
  } catch (e) {
    // Ignore gallery fetch error on clean startup
  }
}

function addToGallery(data) {
  createGalleryItem(data.url, data.filename, true);
  const currentCount = elements.galleryGrid.children.length;
  elements.galleryCount.textContent = `${currentCount} images`;
}

function createGalleryItem(url, filename, prepend = false) {
  const thumb = document.createElement("div");
  thumb.className = "gallery-thumb";
  thumb.title = `Click to preview: ${filename}`;

  const img = document.createElement("img");
  img.src = url;
  img.loading = "lazy";
  thumb.appendChild(img);

  thumb.addEventListener("click", () => {
    elements.loadingState.style.display = "none";
    elements.placeholderState.style.display = "none";
    elements.mainPreviewImg.src = url;
    elements.mainPreviewImg.style.display = "block";
    elements.downloadBtn.href = url;
    elements.downloadBtn.download = filename;
    elements.previewActions.style.display = "flex";
  });

  if (prepend && elements.galleryGrid.firstChild) {
    elements.galleryGrid.insertBefore(thumb, elements.galleryGrid.firstChild);
  } else {
    elements.galleryGrid.appendChild(thumb);
  }
}

// ============================================================================
// Utilities
// ============================================================================
function setStatus(type, message) {
  elements.statusDot.className = `status-indicator ${type}`;
  elements.statusMessage.textContent = message;
}

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${type === "error" ? "❌" : "✅"}</span> <span>${message}</span>`;
  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    setTimeout(() => toast.remove(), 250);
  }, 4500);
}

function copyGenerationParams() {
  if (!lastGenerationData) return;
  const d = lastGenerationData;
  const text = `Model: ${d.model_name} (${d.model_key})\nPrompt: ${d.prompt}\nNegative Prompt: ${d.negative_prompt}\nDimensions: ${d.width}x${d.height}\nSteps: ${d.num_inference_steps}\nCFG Scale: ${d.guidance_scale}\nSeed: ${d.seed}\nGeneration Time: ${d.generation_time_seconds}s`;
  navigator.clipboard.writeText(text).then(() => {
    showToast("Parameters copied to clipboard!", "success");
  });
}
