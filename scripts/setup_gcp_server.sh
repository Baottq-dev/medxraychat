#!/bin/bash
# ============================================================
# MedXrayChat - GCP GPU Server Setup Script
# ============================================================
# Chạy trên máy GCP Ubuntu mới (có GPU)
# 
# Cách dùng:
#   curl -sSL https://raw.githubusercontent.com/Baottq-dev/medxraychat/main/scripts/setup_gcp_server.sh | bash
# Hoặc:
#   wget -qO- https://raw.githubusercontent.com/Baottq-dev/medxraychat/main/scripts/setup_gcp_server.sh | bash
# ============================================================

set -e  # Dừng nếu có lỗi

echo "============================================================"
echo "  MedXrayChat - GCP Server Setup"
echo "============================================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ============================================================
# 1. System Update
# ============================================================
log_info "Updating system packages..."
sudo apt-get update && sudo apt-get upgrade -y

# ============================================================
# 2. Install Essential Tools
# ============================================================
log_info "Installing essential tools..."
sudo apt-get install -y \
    curl \
    wget \
    git \
    git-lfs \
    vim \
    htop \
    unzip \
    software-properties-common \
    ca-certificates \
    gnupg \
    lsb-release

# ============================================================
# 3. Install Python 3.11
# ============================================================
log_info "Installing Python 3.11..."
sudo add-apt-repository ppa:deadsnakes/ppa -y
sudo apt-get update
sudo apt-get install -y \
    python3.11 \
    python3.11-venv \
    python3.11-dev \
    python3.11-distutils

# Set Python 3.11 as default
sudo update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1
sudo update-alternatives --install /usr/bin/python python /usr/bin/python3.11 1

# Install pip
curl -sS https://bootstrap.pypa.io/get-pip.py | python3.11

log_info "Python version: $(python3 --version)"

# ============================================================
# 4. Install Node.js 20
# ============================================================
log_info "Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

log_info "Node version: $(node --version)"
log_info "npm version: $(npm --version)"

# ============================================================
# 5. Install Docker
# ============================================================
log_info "Installing Docker..."
# Remove old versions
sudo apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

# Add Docker's official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add current user to docker group
sudo usermod -aG docker $USER

log_info "Docker version: $(docker --version)"

# ============================================================
# 6. Install NVIDIA Container Toolkit (for GPU)
# ============================================================
log_info "Installing NVIDIA Container Toolkit..."
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
    sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
    sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit

# Configure Docker to use NVIDIA runtime
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

log_info "NVIDIA GPU:"
nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>/dev/null || log_warn "GPU not detected yet"

# ============================================================
# 7. Clone Repository
# ============================================================
log_info "Cloning MedXrayChat repository..."
cd ~
if [ -d "MedXrayChat" ]; then
    log_warn "MedXrayChat directory already exists. Pulling latest..."
    cd MedXrayChat
    git pull
else
    git clone https://github.com/Baottq-dev/medxraychat.git MedXrayChat
    cd MedXrayChat
fi

# ============================================================
# 8. Setup Backend Python Environment
# ============================================================
log_info "Setting up Backend Python environment..."
cd ~/MedXrayChat/apps/api

python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Copy .env example if not exists
if [ ! -f ".env" ]; then
    cp ../../docker/.env.example .env
    log_warn "Created .env from example. Please edit it with your settings!"
fi

deactivate

# ============================================================
# 9. Setup Frontend Node Environment
# ============================================================
log_info "Setting up Frontend Node environment..."
cd ~/MedXrayChat/apps/web

npm install

# Copy .env example if not exists
if [ ! -f ".env.local" ]; then
    cp .env.example .env.local
    log_warn "Created .env.local from example."
fi

# ============================================================
# 10. Create Weights Directory
# ============================================================
log_info "Creating weights directories..."
mkdir -p ~/MedXrayChat/weights/yolo
mkdir -p ~/MedXrayChat/weights/qwen

# ============================================================
# 11. Start Docker Services (Database)
# ============================================================
log_info "Starting Docker services (PostgreSQL + Redis)..."
cd ~/MedXrayChat/docker

# Need to use newgrp or re-login for docker group
sudo docker compose up -d

# ============================================================
# Done!
# ============================================================
echo ""
echo "============================================================"
echo -e "${GREEN}  ✅ Setup Complete!${NC}"
echo "============================================================"
echo ""
echo "Next steps:"
echo ""
echo "1. QUAN TRỌNG: Logout và login lại để Docker group có hiệu lực:"
echo "   exit"
echo "   (sau đó SSH lại)"
echo ""
echo "2. Copy model weights vào thư mục:"
echo "   ~/MedXrayChat/weights/yolo/best.pt      (YOLO model ~14MB)"
echo "   ~/MedXrayChat/weights/qwen/             (Qwen3-VL ~17GB)"
echo ""
echo "3. Chỉnh sửa config:"
echo "   nano ~/MedXrayChat/apps/api/.env"
echo ""
echo "4. Chạy Backend:"
echo "   cd ~/MedXrayChat/apps/api"
echo "   source venv/bin/activate"
echo "   uvicorn main:app --reload --host 0.0.0.0 --port 8000"
echo ""
echo "5. Chạy Frontend (terminal khác):"
echo "   cd ~/MedXrayChat/apps/web"
echo "   npm run dev"
echo ""
echo "============================================================"
