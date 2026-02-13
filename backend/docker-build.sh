#!/bin/bash

# Docker Build Script for CIM-SemanticGraph-Platform
# This script builds the Docker image for the backend

set -e

echo "🐳 Building CIM-SemanticGraph-Platform Docker Image..."
echo "=================================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Image name and tag
IMAGE_NAME="cim-semanticgraph-backend"
IMAGE_TAG="${1:-latest}"
FULL_IMAGE_NAME="${IMAGE_NAME}:${IMAGE_TAG}"

echo -e "${YELLOW}Image: ${FULL_IMAGE_NAME}${NC}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Build the image
echo "📦 Building Docker image..."
docker build -t "${FULL_IMAGE_NAME}" .

if [ $? -eq 0 ]; then
    echo ""
    echo -e "${GREEN}✅ Build successful!${NC}"
    echo ""
    echo "Image: ${FULL_IMAGE_NAME}"
    echo "Size: $(docker images ${IMAGE_NAME} --format '{{.Size}}' | head -1)"
    echo ""
    echo "📋 Next steps:"
    echo "  1. Run with docker-compose: ./docker-run.sh"
    echo "  2. Or run standalone: docker run -p 8080:8080 ${FULL_IMAGE_NAME}"
else
    echo "❌ Build failed!"
    exit 1
fi
