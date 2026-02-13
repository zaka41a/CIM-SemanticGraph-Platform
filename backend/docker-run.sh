#!/bin/bash

# Docker Run Script for CIM-SemanticGraph-Platform
# This script starts the application using docker-compose

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "🚀 Starting CIM-SemanticGraph-Platform with Docker Compose..."
echo "============================================================"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker and try again.${NC}"
    exit 1
fi

# Check if .env file exists, create if not
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  .env file not found. Creating default .env file...${NC}"
    cat > .env << 'ENVEOF'
# Groq AI Configuration
GROQ_API_KEY=your-groq-api-key-here
GROQ_MODEL=llama-3.3-70b-versatile
ENVEOF
    echo -e "${GREEN}✅ Created .env file with default Groq configuration${NC}"
fi

# Start services
echo ""
echo -e "${BLUE}📦 Starting Docker containers...${NC}"
docker-compose up -d

# Wait for services to be healthy
echo ""
echo -e "${YELLOW}⏳ Waiting for services to be healthy...${NC}"
sleep 5

# Check backend health
echo ""
echo "🔍 Checking backend health..."
max_attempts=30
attempt=0

while [ $attempt -lt $max_attempts ]; do
    if curl -sf http://localhost:8080/api/actuator/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Backend is UP and healthy!${NC}"
        break
    fi
    attempt=$((attempt + 1))
    echo "   Attempt $attempt/$max_attempts - waiting..."
    sleep 2
done

if [ $attempt -eq $max_attempts ]; then
    echo -e "${RED}❌ Backend failed to start after $max_attempts attempts${NC}"
    echo "Check logs with: docker-compose logs cim-backend"
    exit 1
fi

# Display service information
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   🎉 CIM-SemanticGraph-Platform Started Successfully!       ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📋 Service URLs:${NC}"
echo "  🌐 API:           http://localhost:8080/api"
echo "  📚 Swagger UI:    http://localhost:8080/api/swagger-ui.html"
echo "  📖 API Docs:      http://localhost:8080/api/api-docs"
echo "  💊 Health Check:  http://localhost:8080/api/actuator/health"
echo "  🤖 Ollama:        http://localhost:11434"
echo ""
echo -e "${BLUE}🔐 Credentials:${NC}"
echo "  Username: admin"
echo "  Password: admin123"
echo ""
echo -e "${BLUE}📊 Useful Commands:${NC}"
echo "  View logs:        docker-compose logs -f"
echo "  Stop services:    docker-compose down"
echo "  Restart:          docker-compose restart"
echo "  View status:      docker-compose ps"
echo ""
echo -e "${YELLOW}💡 Tip: Use 'docker-compose logs -f cim-backend' to follow backend logs${NC}"
echo ""
