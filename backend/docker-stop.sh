#!/bin/bash

# Docker Stop Script for CIM-SemanticGraph-Platform
# This script stops and cleans up Docker containers

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "🛑 Stopping CIM-SemanticGraph-Platform..."
echo "========================================"

# Parse command line arguments
REMOVE_VOLUMES=false

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --remove-volumes|-v) REMOVE_VOLUMES=true ;;
        --help|-h)
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  -v, --remove-volumes    Remove data volumes (WARNING: deletes all data!)"
            echo "  -h, --help              Show this help message"
            exit 0
            ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

# Stop containers
echo ""
echo -e "${YELLOW}📦 Stopping Docker containers...${NC}"
docker-compose down

# Remove volumes if requested
if [ "$REMOVE_VOLUMES" = true ]; then
    echo ""
    echo -e "${RED}⚠️  WARNING: Removing data volumes...${NC}"
    echo "This will delete all TDB2 data, logs, and uploads!"
    read -p "Are you sure? (yes/no): " -r
    if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        docker-compose down -v
        echo -e "${GREEN}✅ Volumes removed${NC}"
    else
        echo -e "${YELLOW}ℹ️  Volume removal cancelled${NC}"
    fi
fi

echo ""
echo -e "${GREEN}✅ CIM-SemanticGraph-Platform stopped successfully${NC}"
echo ""
echo "To start again: ./docker-run.sh"
echo ""
