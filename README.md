# ⚡ Local Image Generation Web Service

A flexible, self-hosted, model-agnostic, and hardware-aware image generation web service and REST API built with **FastAPI**, **Diffusers**, and **PyTorch**.

Designed to run locally on your own hardware (NVIDIA GPU, Apple Silicon Mac, or CPU) and be accessed seamlessly from any device, phone, or laptop over **Tailscale**.

---

## 🌟 Key Features

* **Model-Agnostic Engine:** Dynamically loads and runs different diffusion families (**Stable Diffusion 1.5**, **SDXL**, **SDXL Turbo**, and **FLUX.1 [schnell]**) through a unified inference pipeline.
* **Hardware-Aware Backend:** Automatically detects **CUDA** (NVIDIA), **MPS** (Apple Silicon), or **CPU**, configuring optimal compute precision (`bfloat16`, `float16`, or `float32`).
* **Zero-Restart Model Swapping:** Unload model weights, reclaim VRAM/RAM, and load another architecture on the fly via the web UI or the `POST /api/v1/switch-model` API endpoint.
* **Low-VRAM Safeguards:** Built-in hooks for Model CPU Offload, Sequential CPU Offload, Attention Slicing, and VAE Slicing/Tiling—enabling larger models to run on mid-tier GPUs.
* **Modern Web Studio:** Responsive dark-mode interface with model selector, aspect ratio presets, inference sliders, real-time generation counter, seed manager, and session gallery with direct downloads.
* **Tailscale & Remote Access Ready:** Binds to `0.0.0.0:7860`, ready for private mesh network access, encrypted MagicDNS domains, or Tailscale Serve / Funnel HTTPS.

---

## 📁 Project Structure

```text
Image-generator/
│── app/
│   ├── main.py              # FastAPI app endpoints, lifespan manager & routing
│   ├── generator.py         # Abstract model loader & inference engine (load/unload/offload)
│   ├── hardware.py          # Auto-detects CUDA/MPS/CPU and monitors RAM/VRAM
│   ├── config.py            # Model configuration matrix and hardware profiles
│   ├── static/              # Frontend Web UI (HTML5, Vanilla CSS & Modern JS)
│   │   ├── index.html       # Studio layout and parameter controls
│   │   ├── style.css        # Responsive dark UI styling
│   │   └── script.js        # Dynamic model switching & API client
│   └── outputs/             # Local storage directory for generated PNG images
│       └── .gitkeep
│── .env.example             # Comprehensive configuration template
│── .gitignore               # Excludes weights, generated images, venv, and secrets
│── requirements.txt         # Pinned production dependencies
│── run.bat                  # One-click Windows startup script
│── run.sh                   # One-click Linux / macOS startup script
└── README.md                # Full setup, API reference, and Tailscale guide
```

---

## 🧩 Model Matrix & Hardware Specs

| Profile Key | Model Name | Family | Min VRAM | Rec. VRAM | Default Res | Steps | Default CFG | Best Use Case |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `sd15` | Stable Diffusion 1.5 | SD | 4 GB | 6 GB | 512×512 | 25 | 7.5 | Lightweight, low-spec laptops, fastest baseline |
| `sdxl_turbo` | SDXL Turbo | SDXL | 6 GB | 8 GB | 512×512 | 1–4 | 0.0 | Near-instant real-time generation, distilled weights |
| `sdxl` | SDXL Base 1.0 | SDXL | 8 GB | 12 GB | 1024×1024 | 30 | 7.0 | High-fidelity 1024px art, photorealism, detailed texturing |
| `flux_schnell` | FLUX.1 [schnell] | FLUX | 12 GB | 16 GB | 1024×1024 | 4 | 0.0 | Next-generation 12B rectified flow, exceptional text rendering |
| `animatediff` | AnimateDiff v1.5-2 | AnimateDiff | 6 GB | 8 GB | 512×512 | 16 frames @ 8fps | 7.5 | **100% Native fast video** from text prompt (~15s on RTX 4070) |
| `svd_xt` | Stable Video Diffusion XT | SVD (Video) | 8 GB | 10 GB | 1024×576 | 14–25 frames | N/A | High-motion Image-to-Video animation producing playable `.mp4` |

---

## 🚀 Quick Start Guide

### 1. Prerequisites
* **Python 3.10 – 3.12** installed (recommended for PyTorch and diffusers compatibility).
* **Git** installed on your system.
* *(Optional)* NVIDIA GPU with CUDA 12.1+ drivers or Apple Silicon Mac.

### 2. Clone and Setup Environment

```bash
# Clone the repository
git clone https://github.com/<your-username>/local-image-gen.git
cd local-image-gen

# Create a virtual environment
python -m venv venv

# Activate virtual environment:
# Windows (PowerShell / Command Prompt):
venv\Scripts\activate
# Linux / macOS:
source venv/bin/activate
```

### 3. Install PyTorch with Hardware Acceleration

#### For NVIDIA GPUs (CUDA 12.4):
```bash
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu124
```

#### For Apple Silicon (MPS) or CPU:
```bash
pip install torch torchvision
```

### 4. Install Service Dependencies
```bash
pip install -r requirements.txt
```

### 5. Configure Settings
Copy `.env.example` to `.env`:
```bash
cp .env.example .env     # Linux / macOS
copy .env.example .env   # Windows
```

You can customize `MODEL_KEY`, `HOST`, `PORT`, and memory offloading options in `.env`.

### 6. Start the Service

* **Windows:**
  ```cmd
  run.bat
  ```
* **Linux / macOS:**
  ```bash
  chmod +x run.sh
  ./run.sh
  ```
* **Or directly with Python:**
  ```bash
  python -m app.main --model sd15 --port 7860
  ```

Open your browser at **`http://localhost:7860`** to access the Web Studio!

---

## 🔄 Dynamic Model Swapping

You can select and swap models at any time using any of the following methods:

### Method 1: Web Studio Dropdown
1. Select the desired model profile from the **Active Diffusion Model** dropdown.
2. Click **Apply**.
3. The server immediately frees current GPU memory, clears caches, loads the new model weights, and updates parameter sliders to optimal defaults for that model.

### Method 2: CLI Startup Flag
Pass `--model` or `-m` at startup to override the default:
```bash
python -m app.main --model sdxl_turbo
```

### Method 3: Environment Variable
Edit `.env` or set in your terminal:
```bash
export MODEL_KEY=flux_schnell
python -m app.main
```

### Method 4: REST API Call
Trigger model swapping programmatically from another script or automation:
```bash
curl -X POST http://localhost:7860/api/v1/switch-model \
  -H "Content-Type: application/json" \
  -d '{"model_key": "sdxl"}'
```

---

## ⚙️ Memory & Low-VRAM Safeguards

The engine features memory management strategies configured via `.env`:

| Setting | Values | Description |
| :--- | :--- | :--- |
| `ENABLE_CPU_OFFLOAD` | `auto`, `model`, `sequential`, `none` | Moves sub-modules or sequential layers to system RAM when idle, fitting 8GB–12GB models on 6GB–8GB GPUs. |
| `ENABLE_ATTENTION_SLICING` | `true`, `false` | Computes cross-attention in slices, reducing peak VRAM by up to 30% with minimal speed penalty. |
| `ENABLE_VAE_SLICING` | `true`, `false` | Slices the latent VAE decoder to eliminate out-of-memory spikes at the end of a generation. |
| `ENABLE_VAE_TILING` | `true`, `false` | Tiles VAE processing for massive resolutions (e.g. 1536×640 or multi-megapixel outputs). |

---

## 📡 REST API Reference

Interactive OpenAPI documentation is available live at `http://localhost:7860/docs`.

### 1. `GET /api/v1/health`
Checks server health and returns live hardware stats (VRAM, RAM, compute backend).
```json
{
  "status": "healthy",
  "device": "cuda",
  "device_name": "NVIDIA GeForce RTX 3080",
  "vram": {
    "total_gb": 10.0,
    "allocated_gb": 3.82,
    "reserved_gb": 4.5,
    "free_gb": 5.5
  },
  "ram": {
    "total_gb": 32.0,
    "used_gb": 11.2,
    "available_gb": 20.8
  },
  "engine": {
    "current_model_key": "sd15",
    "is_loaded": true,
    "is_loading": false,
    "device": "cuda",
    "dtype": "torch.float16"
  }
}
```

### 2. `GET /api/v1/models`
Returns the catalog of configured models, parameter defaults, and aspect ratio presets.

### 3. `POST /api/v1/switch-model`
Unloads current pipeline and swaps to a new model.
```bash
curl -X POST http://localhost:7860/api/v1/switch-model \
  -H "Content-Type: application/json" \
  -d '{"model_key": "sdxl_turbo"}'
```

### 4. `POST /api/v1/generate`
Generates an image from a prompt.
```bash
curl -X POST http://localhost:7860/api/v1/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "A cinematic shot of an astronaut riding a neon horse on Mars, photorealistic, 8k",
    "negative_prompt": "blurry, low quality, artifacts",
    "width": 1024,
    "height": 1024,
    "num_inference_steps": 30,
    "guidance_scale": 7.0,
    "seed": 42
  }'
```

### 5. `POST /api/v1/generate-animatediff`
Generates a fast native animation from text prompt using AnimateDiff motion adapter (~12-18s on RTX 4070).
```bash
curl -X POST http://localhost:7860/api/v1/generate-animatediff \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "An astronaut walking on Mars, cosmic dust, cinematic, realistic, 8k",
    "negative_prompt": "blurry, low quality, artifacts",
    "num_frames": 16,
    "fps": 8,
    "num_inference_steps": 25,
    "guidance_scale": 7.5,
    "seed": 42
  }'
```

### 6. `POST /api/v1/generate-video`
Animates a source image into an MP4 video using Stable Video Diffusion (SVD).
```bash
curl -X POST http://localhost:7860/api/v1/generate-video \
  -H "Content-Type: application/json" \
  -d '{
    "image_filename": "20261022_033230_sd15_354b9908.png",
    "num_frames": 14,
    "fps": 7,
    "motion_bucket_id": 127,
    "noise_aug_strength": 0.02
  }'
```

### 7. `GET /api/v1/network`
Returns detected Tailscale IP, LAN Wi-Fi IP, and direct connection URLs for mobile pairing.

### 8. `GET /api/v1/images`
Returns a list of recently generated output files (both images and MP4 videos) with metadata.

---

## 🖥️ Server Deployment & Background Daemon Utilities

The repository includes tools to turn your computer into a **24/7 dedicated background server**:

* **`set_laptop_server_power.bat`**: Configures Windows power plan to never sleep while plugged into AC power and to keep running with the laptop lid closed (clamshell server mode).
* **`open_firewall.bat`**: One-click script (auto-elevates to Administrator) to add an Inbound Rule in Windows Defender Firewall for TCP Port 7860.
* **`start_server_background.vbs`**: Silent launcher that starts the FastAPI image generation service in the background **without keeping a visible console window open**.
* **`stop_server.bat`**: Gracefully terminates any background server process running on port 7860.
* **`setup_autostart.bat`**: Adds or removes an auto-start shortcut in Windows Startup (`shell:startup`) so your image server starts automatically every time your PC boots up.

---

## 🌐 Remote Access via Tailscale & Local Wi-Fi

Because the server binds to `0.0.0.0:7860`, it is instantly accessible across your **Tailscale** private mesh network without opening router ports or exposing your IP.

### Quick URLs (Click the 🌐 badge in the Web Studio header to copy):
* **Tailscale (Global Access from Any Phone/Laptop):** `http://<your-tailscale-ip>:7860`
* **Local Network (Home Wi-Fi):** `http://<your-local-ip>:7860`

### Option A: Direct Tailscale IP Access (Quickest)
1. Install Tailscale on your host machine and mobile device/laptop: [tailscale.com/download](https://tailscale.com/download).
2. Find your host machine's Tailscale IP:
   ```bash
   tailscale ip -4
   # Output example: 100.100.233.81
   ```
3. Open a browser on any connected Tailscale device and navigate to:
   ```text
   http://100.100.233.81:7860
   ```

### Option B: Tailscale Serve with MagicDNS & HTTPS (Recommended)
You can route encrypted traffic with a valid HTTPS certificate directly to your machine:
```bash
# Expose port 7860 via Tailscale Serve over HTTPS
tailscale serve https / http://localhost:7860
```
You can now access your studio via:
```text
https://<machine-name>.<your-tailnet>.ts.net
```

### Option C: Tailscale Funnel (Public HTTPS Access)
If you want to share your generation studio publicly with friends or test outside your Tailnet:
```bash
tailscale funnel 7860
```

---

## 🐙 GitHub Workflow: Pushing & Cross-Machine Deployment

### Step 1: Initialize Git and Commit
```bash
# Navigate to the project directory
cd Image-generator

# Initialize git repository
git init

# Stage all files (.gitignore will protect outputs, cache, and secrets)
git add .

# Verify staged files
git status

# Create the initial commit
git commit -m "feat: initial release of modular local image generation service"
```

### Step 2: Push to GitHub
1. Create a new repository on [GitHub](https://github.com/new) (e.g., named `local-image-gen`).
2. Add your GitHub remote and push:
```bash
git branch -M main
git remote add origin https://github.com/<your-username>/local-image-gen.git
git push -u origin main
```

### Step 3: Deploy to Any Other Machine in 3 Commands
When setting up on a new desktop, cloud GPU instance (RunPod / Vast.ai / Lambda), or Mac:
```bash
git clone https://github.com/<your-username>/local-image-gen.git
cd local-image-gen
pip install -r requirements.txt
python -m app.main --model sd15
```

---

## 🛡️ License

This project is licensed under the **Apache-2.0 License**. Underlying model weights (`FLUX.1-schnell`, `SDXL`, `SD 1.5`) are subject to their respective open licenses from Black Forest Labs and Stability AI.
