# 🐳 CIM-SemanticGraph-Platform - Docker Deployment

Complete guide to deploy the CIM-SemanticGraph platform with Docker.

---

## 📋 Table of Contents

- [Prerequisites](#-prerequisites)
- [Docker Architecture](#-docker-architecture)
- [Quick Installation](#-quick-installation)
- [Configuration](#️-configuration)
- [Management Scripts](#-management-scripts)
- [Volumes and Persistence](#-volumes-and-persistence)
- [Monitoring and Logs](#-monitoring-and-logs)
- [Troubleshooting](#-troubleshooting)
- [Production](#-production)

---

## 🔧 Prerequisites

Before starting, make sure you have installed:

- **Docker**: Version 20.10 or higher
- **Docker Compose**: Version 2.0 or higher

### Verify Installation

```bash
docker --version
docker-compose --version
```

### Installing Docker

#### macOS
```bash
# Install Docker Desktop
brew install --cask docker
```

#### Linux (Ubuntu/Debian)
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt-get install docker-compose-plugin
```

#### Windows
Download and install [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop)

---

## 🏗️ Docker Architecture

### Deployed Services

```
┌─────────────────────────────────────────────┐
│         CIM-SemanticGraph-Platform          │
├─────────────────────────────────────────────┤
│                                             │
│  ┌──────────────────┐  ┌─────────────────┐ │
│  │   cim-backend    │  │   cim-ollama    │ │
│  │   (Spring Boot)  │  │  (Local LLM)    │ │
│  │   Port: 8080     │  │  Port: 11434    │ │
│  └──────────────────┘  └─────────────────┘ │
│           │                      │          │
│           ↓                      ↓          │
│  ┌──────────────────┐  ┌─────────────────┐ │
│  │   tdb2-data      │  │  ollama-data    │ │
│  │   (TDB2 Database)│  │  (LLM Models)   │ │
│  └──────────────────┘  └─────────────────┘ │
│                                             │
└─────────────────────────────────────────────┘
```

### Components

1. **cim-backend**: Spring Boot API with Apache Jena
   - Port: 8080
   - Uses Groq (cloud API) or Ollama (local) for AI
   - TDB2 database for the RDF graph

2. **cim-ollama**: Local LLM service (fallback)
   - Port: 11434
   - Model: llama3.2
   - Used if Groq API is not configured

### Persistent Volumes

- `cim-tdb2-data`: TDB2 database (RDF graph)
- `cim-logs-data`: Application logs
- `cim-uploads-data`: Imported Excel files
- `cim-ollama-data`: Ollama models

---

## 🚀 Quick Installation

### 1. Clone the Project

```bash
cd /path/to/CIM-SemanticGraph-Platform/backend
```

### 2. Configuration (Optional)

Create a `.env` file to customize the configuration:

```bash
cat > .env << 'ENVEOF'
# Groq AI Configuration
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile
ENVEOF
```

> **Note**: If you don't create a `.env` file, the `docker-run.sh` script will create one automatically with default values.

### 3. Build the Docker Image

```bash
./docker-build.sh
```

### 4. Start Services

```bash
./docker-run.sh
```

### 5. Verify Deployment

```bash
# Check container status
docker-compose ps

# Test the API
curl -u admin:admin123 http://localhost:8080/api/actuator/health
```

---

## ⚙️ Configuration

### Environment Variables

The following variables can be configured in the `.env` file or directly in `docker-compose.yml`:

#### Groq AI Configuration (Recommended)

```env
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=llama-3.3-70b-versatile
```

#### Ollama Configuration (Fallback)

```env
OLLAMA_BASE_URL=http://ollama:11434
OLLAMA_MODEL=llama3.2
```

#### Memory Configuration

```env
JAVA_OPTS=-Xms512m -Xmx2g
```

#### CORS Configuration

```env
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

---

## 📜 Management Scripts

### docker-build.sh

Builds the backend Docker image.

```bash
# Build with "latest" tag
./docker-build.sh

# Build with custom tag
./docker-build.sh v1.0.0
```

### docker-run.sh

Starts all services with docker-compose.

```bash
./docker-run.sh
```

### docker-stop.sh

Stops Docker services.

```bash
# Stop containers (data preserved)
./docker-stop.sh

# Stop and remove volumes (⚠️ DELETES ALL DATA)
./docker-stop.sh --remove-volumes
```

---

## 💾 Volumes and Persistence

### Created Volumes

Data is stored in named Docker volumes:

```bash
# List volumes
docker volume ls | grep cim

# Inspect a volume
docker volume inspect cim-tdb2-data
```

### Backup Data

#### Backup TDB2

```bash
# Create a backup
docker run --rm \
  -v cim-tdb2-data:/data \
  -v $(pwd):/backup \
  alpine tar czf /backup/tdb2-backup-$(date +%Y%m%d).tar.gz /data
```

#### Restore TDB2

```bash
# Restore from backup
docker run --rm \
  -v cim-tdb2-data:/data \
  -v $(pwd):/backup \
  alpine sh -c "cd /data && tar xzf /backup/tdb2-backup-YYYYMMDD.tar.gz --strip 1"
```

### Export Data

```bash
# Export RDF graph in Turtle format
curl -u admin:admin123 \
  "http://localhost:8080/api/cim/export?format=TURTLE" \
  -o cim-export-$(date +%Y%m%d).ttl
```

---

## 🔍 Monitoring and Logs

### View Logs

```bash
# Logs from all services
docker-compose logs -f

# Backend logs only
docker-compose logs -f cim-backend

# Last 100 lines
docker-compose logs --tail=100 cim-backend
```

### Resource Monitoring

```bash
# Real-time CPU/Memory usage
docker stats

# Detailed container info
docker inspect cim-backend
```

### Health Checks

```bash
# Check backend health
curl http://localhost:8080/api/actuator/health

# Check Ollama
curl http://localhost:11434/api/tags
```

---

## 🔧 Troubleshooting

### Container won't start

```bash
# View startup errors
docker-compose logs cim-backend

# Check Docker image
docker images | grep cim-semanticgraph

# Rebuild image
./docker-build.sh
docker-compose up -d --force-recreate
```

### Port already in use

If port 8080 is already in use:

```bash
# Find process using the port
lsof -i :8080

# Modify port in docker-compose.yml
ports:
  - "9090:8080"  # Use 9090 instead of 8080
```

### Memory issues

```bash
# Increase Java memory
docker-compose up -d \
  -e JAVA_OPTS="-Xms1g -Xmx4g"
```

### Complete reset

```bash
# Stop and remove everything (⚠️ DATA LOSS)
docker-compose down -v
docker rmi cim-semanticgraph-backend:latest

# Rebuild and restart
./docker-build.sh
./docker-run.sh
```

---

## 🚀 Production

### Production Recommendations

#### 1. Security

```yaml
# docker-compose.prod.yml
services:
  cim-backend:
    environment:
      # Use secrets
      - SECURITY_USER_PASSWORD=${ADMIN_PASSWORD}
      - GROQ_API_KEY=${GROQ_API_KEY}
    
    # Limit resources
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
```

#### 2. Reverse Proxy (Nginx)

```nginx
# nginx.conf
server {
    listen 443 ssl;
    server_name cim-platform.example.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    location /api {
        proxy_pass http://localhost:8080/api;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

---

## 📚 Useful Commands

### Container Management

```bash
# Start
docker-compose up -d

# Stop
docker-compose down

# Restart a service
docker-compose restart cim-backend

# Recreate a container
docker-compose up -d --force-recreate cim-backend

# View status
docker-compose ps
```

### Image Management

```bash
# List images
docker images | grep cim

# Remove an image
docker rmi cim-semanticgraph-backend:latest

# Clean unused images
docker image prune -a
```

### Execute Commands in Container

```bash
# Interactive shell
docker-compose exec cim-backend sh

# Execute a command
docker-compose exec cim-backend curl http://localhost:8080/api/actuator/health
```

---

## ✅ Deployment Checklist

- [ ] Docker and Docker Compose installed
- [ ] `.env` file configured with Groq API key
- [ ] Image built: `./docker-build.sh`
- [ ] Services started: `./docker-run.sh`
- [ ] Backend accessible: `http://localhost:8080/api/actuator/health`
- [ ] Swagger UI accessible: `http://localhost:8080/api/swagger-ui.html`
- [ ] Excel import test successful
- [ ] Volume backup configured

---

**🎉 Congratulations!** Your CIM-SemanticGraph platform is now deployed with Docker!
