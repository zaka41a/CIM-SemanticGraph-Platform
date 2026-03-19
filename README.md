<div align="center">

![CIM-SemanticGraph-Platform Logo](frontend/public/logo.svg)

# CIM-SemanticGraph-Platform

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![Tests](https://img.shields.io/badge/tests-passing-green.svg)
![CI/CD](https://img.shields.io/badge/CI%2FCD-GitHub%20Actions-blue.svg)
![Java](https://img.shields.io/badge/Java-17%2B-orange.svg)
![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.2-green.svg)
![Apache Jena](https://img.shields.io/badge/Apache%20Jena-5.0-blue.svg)
![React](https://img.shields.io/badge/React-18-61DAFB.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)
![Python](https://img.shields.io/badge/Python-3.13-3776AB.svg)
![Pandapower](https://img.shields.io/badge/Pandapower-enabled-00A86B.svg)
![Qdrant](https://img.shields.io/badge/Qdrant-vector--db-DC143C.svg)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)

**Enterprise-grade platform for transforming CIM power system models into semantic knowledge graphs with Claude AI Agent, GraphRAG, vector search and interactive network visualization**

[Features](#-key-features) • [Quick Start](#-quick-start) • [Architecture](#-architecture) • [API Reference](#-api-reference) • [Usage Examples](#-usage-examples)

</div>

---

## Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [Architecture](#-architecture)
- [Technology Stack](#-technology-stack)
- [Quick Start](#-quick-start)
- [Configuration](#-configuration)
- [Usage Examples](#-usage-examples)
- [API Reference](#-api-reference)
- [Load Flow Analysis](#-load-flow-analysis)
- [Claude AI Agent](#-claude-ai-agent)
- [Vector Search & Indexing](#-vector-search--indexing)
- [Testing](#-testing)
- [Project Structure](#-project-structure)
- [Contributing](#-contributing)
- [License](#-license)

---

## Overview

**CIM-SemanticGraph-Platform** is a comprehensive, production-ready system that transforms **Common Information Model (CIM)** power system data into semantic knowledge graphs, enabling advanced analytics and intelligent decision support through a **Claude AI Agent** with native tool calling, GraphRAG, Qdrant vector search, and real-time network topology visualization.

### Problem Statement

Modern electrical grid digitalization requires standardized, interoperable models. The CIM (IEC 61970/61968) serves as the international standard, but direct exploitation of power system data remains limited without semantic transformation and intelligent context retrieval.

### Solution

This platform provides:
- **Semantic Transformation**: CIM → RDF/OWL knowledge graphs stored in Apache Jena/Fuseki
- **AI Agent (Claude)**: Autonomous reasoning over the graph with 5 native tools (SPARQL, vector search, load flow, entity details, graph traversal)
- **Vector Search**: Qdrant-powered semantic similarity search over indexed CIM entities
- **Advanced Analytics**: Load flow calculations, impact analysis, network topology map
- **Multi-format Support**: CIM/XML, CIM/RDF, Excel import with field mapping UI

---

## Key Features

### Data Import & Transformation

- **Multi-format Support**
  - CIM/XML files (IEC 61970 standard)
  - CIM/RDF files (semantic web format)
  - Excel network files with interactive column mapping modal
  - Automatic format detection and conversion

- **Knowledge Graph Construction**
  - RDF/OWL triple generation
  - CIM ontology compliance (IEC 61970/61968)
  - Schema validation and integrity checks
  - Auto-indexing into Qdrant after every import

### Claude AI Agent

- **Autonomous Tool Calling** (up to 8 reasoning rounds)
  - `semantic_search` — Qdrant vector similarity search
  - `sparql_query` — direct SPARQL queries on Fuseki
  - `load_flow` — real-time pandapower calculations
  - `get_entity_details` — Jena triple store lookups
  - `graph_traverse` — subgraph extraction & multi-hop traversal

- **SSE Streaming**
  - Real-time token-by-token streaming via Server-Sent Events
  - Tool call / tool result events visible in the UI
  - Confidence score and source list in final event

### GraphRAG Intelligence

- **Context-Aware Retrieval**
  - Custom graph traversal algorithms
  - Semantic embedding generation (OpenAI text-embedding-3-small)
  - Intelligent subgraph extraction
  - Multi-hop relationship discovery

- **Multi-provider LLM Support**
  - Claude AI (primary, with tool calling)
  - Groq API (fast inference fallback)
  - Ollama (local LLM)

### Load Flow Analysis

- **Power System Calculations via pandapower**
  - DC and AC load flow solvers
  - Voltage and angle calculations
  - Branch power flow and loading percentages
  - System loss computation and violation detection

- **Network Topology Map**
  - Interactive Cytoscape.js visualization
  - Voltage-colored buses (green/yellow/red by level)
  - Loading-colored branches with hover tooltips
  - Toggle between Topology view and data tables

### Advanced Querying

- **SPARQL Query Engine**
  - SPARQL 1.1 support
  - Complex graph queries with OWL reasoning
  - Query validation and sample library

- **Natural Language Examples**
  - "What is the voltage at Düsseldorf 220kV?"
  - "Show all generators in the 380kV network"
  - "What equipment is affected if substation X fails?"
  - "Calculate load flow at bus Köln"

### Dashboard & Visualization

- **Pro Dashboard**
  - 8 stat cards: Substations, Lines, Transformers, Loads, Generators, Buses, Triples, Vector Indexed
  - Platform Services panel: live status for Qdrant, pandapower, LLM
  - Re-index button for on-demand vector re-indexing

- **Interactive Graph Visualization**
  - Cytoscape.js with multiple layout algorithms
  - Node/edge filtering and export to PNG

### Data Validation

- **SHACL Validation**
  - Shape-based validation with detailed violation reports
  - CIM compliance verification

---

## Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                  Frontend Layer (React + TypeScript)               │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌─────────────┐   │
│  │ LandingPage│  │ Dashboard  │  │ Graph View │  │GraphRAG Chat│   │
│  │            │  │ 8 StatCards│  │ Cytoscape  │  │ SSE Stream  │   │
│  └────────────┘  └────────────┘  └────────────┘  └─────────────┘   │
│  ┌─────────────┐  ┌────────────┐  ┌─────────────┐  ┌───────────┐   │
│  │ Data Import │  │SPARQL Edit.│  │  LoadFlow   │  │ Settings  │   │
│  │+MappingModal│  │            │  │+Topology Map│  │           │   │
│  └─────────────┘  └────────────┘  └─────────────┘  └───────────┘   │
└───────────────────────────┬────────────────────────────────────────┘
                            │ REST / SSE
┌───────────────────────────┴───────────────────────────────────────┐
│                Backend Layer (Spring Boot 3.2)                    │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │                    REST Controllers                        │   │
│  │  CimController  ExcelController  GraphRAGController        │   │
│  │  LoadFlowController  SparqlController  ShaclController     │   │
│  └──────────┬──────────────────────┬──────────────────────────┘   │
│             │                      │                              │
│  ┌──────────┴──────────┐  ┌────────┴──────────────┐               │
│  │  ClaudeAgentService │  │   GraphRAGService     │               │
│  │  5 native tools     │  │   Context building    │               │
│  │  SSE streaming      │  │   LLM fallback chain  │               │
│  └──────────┬──────────┘  └───────────────────────┘               │
│             │                                                     │
│  ┌──────────┴────────────────────────────────────────────────┐    │
│  │  CIMIndexingService   QdrantService   EmbeddingService    │    │
│  │  Auto-index on import  Vector upsert  OpenAI embeddings   │    │
│  └──────────┬────────────────────────────────────────────────┘    │
│             │                                                     │
│  ┌──────────┴────────────────────────────────────────────────┐    │
│  │   Apache Jena Fuseki (Embedded TDB2, port 3030)           │    │
│  │   SPARQL 1.1 · OWL reasoning · CIM ontology               │    │
│  └───────────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────────┘
           │                          │
  ┌────────┴────────┐        ┌────────┴────────────┐
  │  Qdrant (6333)  │        │  Powerflow (8000)   │
  │  Vector DB      │        │  Python pandapower  │
  │  cim_entities   │        │  SemanticBusFinder  │
  └─────────────────┘        └─────────────────────┘
           │
  ┌────────┴────────┐
  │  External LLMs  │
  │  Claude AI      │
  │  Groq API       │
  │  Ollama         │
  └─────────────────┘
```

---

## Technology Stack

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| **Java** | 17+ | Core language |
| **Spring Boot** | 3.2 | Application framework |
| **Apache Jena** | 5.0.0 | RDF/OWL processing, embedded Fuseki/TDB2 |
| **Spring WebFlux** | 3.2 | SSE streaming (Reactor/Flux) |
| **Spring Security** | 3.2 | Security framework |
| **Maven** | 3.8+ | Build & dependency management |
| **JUnit 5** | 5.x | Testing framework |
| **Lombok** | Latest | Boilerplate reduction |

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| **React** | 18 | UI framework |
| **TypeScript** | 5.0 | Type safety |
| **Vite** | Latest | Build tool |
| **Cytoscape.js** | Latest | Graph & topology visualization |
| **TailwindCSS** | Latest | Styling |
| **Axios** | Latest | HTTP client |

### AI & Vector Search

| Technology | Purpose |
|------------|---------|
| **Claude claude-sonnet-4-6** | Primary AI agent with native tool calling |
| **Qdrant** | Vector database for semantic similarity search |
| **OpenAI Embeddings** | text-embedding-3-small (1536-dim) for entity indexing |
| **Groq API** | Fast LLM inference fallback |
| **Ollama** | Local LLM fallback |

### Infrastructure

| Technology | Purpose |
|------------|---------|
| **Docker / Docker Compose** | Fuseki + Qdrant containers |
| **Python / uvicorn** | pandapower powerflow microservice |
| **dev.sh / stop.sh** | One-command dev lifecycle management |

---

## Quick Start

### Prerequisites

- **Java 17+**
- **Maven 3.8+** (or use the included `./mvnw`)
- **Node.js 18+** and **npm**
- **Python 3.13+**
- **Docker Desktop** (for Fuseki + Qdrant)

### One-command startup

```bash
# Clone the repository
git clone https://github.com/yourusername/CIM-SemanticGraph-Platform.git
cd CIM-SemanticGraph-Platform

# Create your .env file (see Configuration section)
cp backend/.env.example backend/.env
# Edit backend/.env with your API keys

# Start everything
./dev.sh
```

The script will:
1. Check all prerequisites
2. Start Fuseki and Qdrant via Docker Compose
3. Install Python deps and start the pandapower microservice
4. Compile and start the Spring Boot backend
5. Install npm deps and start the Vite dev server

```
Frontend    →  http://localhost:3000
Backend API →  http://localhost:8080/api
Swagger UI  →  http://localhost:8080/swagger-ui.html
Fuseki UI   →  http://localhost:3030
Qdrant UI   →  http://localhost:6333/dashboard
Powerflow   →  http://localhost:8000/docs
```

### Partial startup options

```bash
./dev.sh --infra     # Infrastructure only (Fuseki + Qdrant)
./dev.sh --backend   # Backend + infra (no frontend)
./dev.sh --status    # Show status of all services
./stop.sh            # Stop all services
```

### Stop all services

```bash
./stop.sh
```

---

## Configuration

### Environment file

Create `backend/.env` with your API keys:

```bash
# Required for Claude AI Agent
CLAUDE_API_KEY=sk-ant-...

# Required for vector embeddings (falls back to keyword search if not set)
OPENAI_API_KEY=sk-...

# Optional: fast LLM fallback
GROQ_API_KEY=gsk_...
```

### application.yml (key settings)

```yaml
jena:
  storage-mode: fuseki          # embedded Fuseki with TDB2 persistence
  fuseki:
    remote-url: http://localhost:3030
    dataset-name: cim

qdrant:
  url: http://localhost:6333
  collection-name: cim_entities
  vector-size: 1536

claude:
  api:
    key: ${CLAUDE_API_KEY:}
    model: claude-sonnet-4-6

graphrag:
  retrieval:
    top-k: 10
    max-depth: 3
  context:
    max-triples: 1000
```

---

## Usage Examples

### 1. Import CIM / Excel data

```bash
# Import CIM RDF file
curl -X POST http://localhost:8080/api/cim/import \
  -F "file=@examples/NRW-Power-Network.rdf" \
  -F "format=rdf"

# Import Excel network file
curl -X POST http://localhost:8080/api/excel/import \
  -F "file=@examples/NRW-Power-Network.xlsx"
```

After import, entities are automatically indexed into Qdrant.

### 2. Stream a question to the Claude AI Agent

```bash
curl -N 'http://localhost:8080/api/graphrag/stream?question=show+all+substations'
```

Events returned:
```json
{"type":"tool_call",   "tool":"sparql_query", "input":{...}}
{"type":"tool_result", "tool":"sparql_query", "chars":1842}
{"type":"text",        "text":"The network contains 12 substations..."}
{"type":"done",        "sources":[...], "confidence":0.92, "execution_time_ms":3210}
```

### 3. Standard GraphRAG question

```bash
curl -X POST http://localhost:8080/api/graphrag/ask \
  -H "Content-Type: application/json" \
  -d '{"question": "What is the voltage at Düsseldorf 220kV?", "sessionId": "s1"}'
```

### 4. SPARQL query

```bash
curl -X POST http://localhost:8080/api/sparql/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "PREFIX cim: <http://iec.ch/TC57/CIM100#> SELECT ?s ?name WHERE { ?s a cim:Substation ; cim:IdentifiedObject.name ?name }"
  }'
```

### 5. Load flow calculation

```bash
curl -X POST http://localhost:8080/api/loadflow/calculate
```

### 6. Check vector indexing status

```bash
curl http://localhost:8080/api/cim/indexing-status

# Trigger manual re-index
curl -X POST http://localhost:8080/api/cim/reindex
```

---

## Load Flow Analysis

### Features

- **DC Load Flow Solver**: Fast power flow calculations via pandapower
- **Semantic Bus Finder**: Maps natural language bus names to network IDs
- **Bus Analysis**: Voltage magnitudes, angles, power injections
- **Branch Analysis**: Power flows, losses, loading percentages
- **Violation Detection**: Voltage limits, branch overloads
- **Network Topology Map**: Cytoscape.js with voltage/loading color coding

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/loadflow/calculate` | POST | Full network load flow |
| `/api/loadflow/calculate/{busId}` | POST | Load flow for specific bus |
| `/api/loadflow/voltage/{busId}` | GET | Voltage at a specific bus |
| `/api/loadflow/statistics` | GET | System generation/load/loss summary |
| `/api/loadflow/violations` | GET | Voltage and branch violations |

---

## Claude AI Agent

The `ClaudeAgentService` implements an autonomous reasoning loop using Claude claude-sonnet-4-6 with native tool calling.

### How it works

1. User question is sent with 5 tool definitions
2. Claude decides which tools to call and in what order
3. Tool results are fed back to Claude (up to 8 rounds)
4. Final answer is streamed token by token via SSE

### Tools available to the agent

| Tool | Backend | Description |
|------|---------|-------------|
| `semantic_search` | Qdrant | Vector similarity search on indexed entities |
| `sparql_query` | Apache Fuseki | Execute arbitrary SPARQL SELECT queries |
| `load_flow` | pandapower service | Run load flow for a bus or full network |
| `get_entity_details` | Jena triple store | Fetch all triples for a given CIM entity URI |
| `graph_traverse` | GraphTraverser | Extract multi-hop subgraph around an entity |

### SSE Stream endpoint

```
GET /api/graphrag/stream?question=<your question>
```

---

## Vector Search & Indexing

CIM entities are automatically embedded and indexed into Qdrant after every import.

- **Embedding model**: OpenAI `text-embedding-3-small` (1536 dimensions)
- **Collection**: `cim_entities`
- **Indexed fields**: entity URI, type, name, voltage level, description
- **Fallback**: keyword-based SPARQL search if OpenAI key is not set

### Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/cim/indexing-status` | GET | Number of indexed entities and status |
| `/api/cim/reindex` | POST | Re-index all entities from the triple store |

---

## Testing

### Backend

```bash
cd backend
./mvnw test

# With coverage report
./mvnw test jacoco:report
# Report: backend/target/site/jacoco/index.html
```

### Frontend

```bash
cd frontend
npm test
```

---

## Project Structure

```
CIM-SemanticGraph-Platform/
├── dev.sh                            # One-command dev startup
├── stop.sh                           # Stop all services
├── backend/
│   ├── .env                          # API keys (not committed)
│   ├── docker-compose.yml            # Fuseki + Qdrant containers
│   └── src/main/java/com/cim/semanticgraph/
│       ├── config/
│       │   ├── JenaConfig.java       # Embedded Fuseki/TDB2 setup
│       │   └── SecurityConfig.java
│       ├── controller/
│       │   ├── CimController.java
│       │   ├── ExcelController.java
│       │   ├── GraphRAGController.java  # /ask + /stream (SSE)
│       │   └── LoadFlowController.java
│       └── service/
│           ├── ClaudeAgentService.java  # AI Agent with 5 tools
│           ├── QdrantService.java       # Vector DB client
│           ├── CIMIndexingService.java  # Auto-indexing pipeline
│           ├── EmbeddingService.java    # OpenAI embeddings
│           ├── GraphRAGService.java
│           ├── JenaService.java
│           ├── LoadFlowService.java
│           └── ExcelImportService.java
│
├── frontend/src/
│   ├── pages/
│   │   ├── LandingPage.tsx           # New landing page
│   │   ├── Dashboard.tsx             # Pro dashboard with 8 stat cards
│   │   ├── LoadFlow.tsx              # Load flow + topology map toggle
│   │   ├── DataImport.tsx
│   │   └── Settings.tsx
│   ├── components/
│   │   ├── loadflow/
│   │   │   └── NetworkTopologyMap.tsx  # Cytoscape topology visualization
│   │   ├── dataimport/
│   │   │   └── ExcelMappingModal.tsx   # Column mapping UI
│   │   ├── GraphVisualization.tsx
│   │   └── Layout.tsx / Sidebar.tsx
│   └── services/api.ts               # All REST + SSE calls
│
├── powerflow-service/
│   └── app/
│       ├── main.py                   # FastAPI pandapower service
│       ├── models.py
│       └── semantic_bus_finder.py    # NLP bus name resolution
│
├── examples/
│   └── NRW-Power-Network.xlsx        # Sample NRW network data
├── docs/diagrams/
└── README.md
```

---

## API Reference

### CIM Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/cim/import` | POST | Import CIM file (RDF/XML) |
| `/api/cim/export` | GET | Export knowledge graph |
| `/api/cim/statistics` | GET | Graph statistics |
| `/api/cim/clear` | DELETE | Clear knowledge graph |
| `/api/cim/validate` | POST | Validate CIM file |
| `/api/cim/indexing-status` | GET | Vector indexing status |
| `/api/cim/reindex` | POST | Re-index all entities |

### Excel Import

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/excel/import` | POST | Import Excel network file |
| `/api/excel/format` | GET | Excel format specification |

### GraphRAG / Claude Agent

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/graphrag/ask` | POST | Natural language question (JSON response) |
| `/api/graphrag/stream` | GET | SSE streaming with tool events |
| `/api/graphrag/impact` | POST | Equipment impact analysis |
| `/api/graphrag/verify` | POST | Network consistency check |
| `/api/graphrag/history` | GET | Full chat history |

### SPARQL

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sparql/query` | POST | Execute SPARQL SELECT |
| `/api/sparql/ask` | POST | Execute SPARQL ASK |
| `/api/sparql/validate` | POST | Validate SPARQL syntax |
| `/api/sparql/samples` | GET | Sample query library |

### Load Flow

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/loadflow/calculate` | POST | Full network load flow |
| `/api/loadflow/calculate/{busId}` | POST | Load flow for a bus |
| `/api/loadflow/voltage/{busId}` | GET | Bus voltage |
| `/api/loadflow/statistics` | GET | System statistics |
| `/api/loadflow/violations` | GET | Violations list |

### SHACL Validation

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/shacl/validate` | GET | Validate knowledge graph |
| `/api/shacl/shapes` | GET | SHACL shapes |
| `/api/shacl/validate/detailed` | POST | Detailed validation report |

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Guidelines

- Follow Java and TypeScript coding standards
- Write unit tests for new features
- Ensure all tests pass before submitting

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

## Acknowledgments

- **IEC Technical Committee 57** — CIM standards (IEC 61970/61968)
- **Apache Jena** — RDF/OWL framework and embedded Fuseki
- **Anthropic** — Claude AI models and tool calling API
- **Qdrant** — Open-source vector database
- **pandapower** — Python power system analysis
- **Groq** — Fast language model inference
- **Ollama** — Local language model support

---

<div align="center">

**Built for intelligent power grid management**

[Star this repo](https://github.com/yourusername/CIM-SemanticGraph-Platform) • [Documentation](docs/) • [Report Bug](https://github.com/yourusername/CIM-SemanticGraph-Platform/issues)

</div>
