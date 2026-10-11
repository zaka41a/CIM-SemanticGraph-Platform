 <p align="center">
    <img src="frontend/public/logo.svg" alt="CIM SemanticGraph Platform logo" width="128" />
  </p>

  <h1 align="center">CIM SemanticGraph Platform</h1>

Web application for importing CIM power networks, querying them with SPARQL and
GraphRAG, and calculating power flow.

The application has three parts:

- `frontend/`: React and TypeScript interface.
- `backend/`: Spring Boot API, CIM import, graph queries and network analysis.
- `powerflow-service/`: FastAPI service using pandapower for AC and OPF calculations.

Apache Jena Fuseki stores RDF data. Qdrant stores entity embeddings when an embedding
provider is configured. DC calculations are also available in the Java backend.

## Local setup

Prerequisites: Java 21, Maven, Node.js 22, npm, Python 3.11 or later, and a running
Docker daemon with Docker Compose. The Maven wrapper is included in `backend/`.

```bash
cp backend/.env.example backend/.env
```

Set the provider keys you need in `backend/.env`, then start the services:

```bash
./dev.sh
```

The script starts Fuseki and Qdrant, installs the Python and frontend dependencies,
and starts the power flow service, backend and frontend. Logs are written to
`.logs/`. API keys are optional for importing data, SPARQL queries and electrical
calculations; chat and vector indexing need their respective providers.

| Service | Default URL |
| --- | --- |
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8080/api |
| API documentation | http://localhost:8080/api/swagger-ui.html |
| Backend health | http://localhost:8080/api/actuator/health |
| Fuseki | http://localhost:3030 |
| Qdrant | http://localhost:6333/dashboard |
| Power flow API | http://localhost:8000/docs |

The startup output reports the actual frontend and power flow ports if their
usual ports are occupied.

```bash
./dev.sh --infra     # Fuseki and Qdrant only
./dev.sh --backend   # Infrastructure, power flow and backend
./dev.sh --status    # Check the default service ports
./stop.sh
```

Infrastructure can also be started directly:

```bash
docker compose -f backend/docker-compose.yml up -d fuseki qdrant
```

## Configuration

`backend/.env.example` lists the provider settings. Defaults and other backend
settings are in `backend/src/main/resources/application.yml`.

| Variable | Purpose |
| --- | --- |
| `KICONNECT_API_KEY` | KI Connect chat provider |
| `GROQ_API_KEY` | Groq chat provider |
| `CLAUDE_API_KEY` | Claude agent with tool calls |
| `OPENAI_API_KEY` | Entity embeddings for Qdrant |
| `LLM_DEFAULT_PROVIDER` | Default selectable chat provider: `gpt5` or `groq` |
| `JENA_FUSEKI_REMOTE_URL` | Fuseki server URL |
| `QDRANT_URL` | Qdrant server URL |
| `POWERFLOW_SERVICE_URL` | Python power flow service URL |

The frontend defaults to `http://localhost:8080/api`. To point it elsewhere, set
`VITE_API_URL` in `frontend/.env` before starting or building the frontend.

## Sample data

- `examples/cim_xml/`, `examples/cim_rdf/`, `examples/rdf_xml/`, `examples/turtle/`
  and `examples/excel/` contain generated networks from 1 to 100 buses.
- `backend/examples/network-simple-3bus.xlsx` and
  `backend/examples/network-complex-6bus.xlsx` are small power flow examples.
- `examples/cim test/` contains the supplied spreadsheet networks.
- `examples/converted/` contains their converted RDF and merged Excel files.

The generators and conversion scripts are kept alongside these datasets. Their
Python dependencies, including `openpyxl`, must be installed separately if you
want to regenerate the files.

A basic walkthrough is: import a small network, inspect the dashboard and graph,
run a SPARQL query, calculate power flow, then export a result. Chat additionally
requires a configured language model. AC and OPF require the Python service;
check the returned calculation method when a DC fallback is used.

Chat history is stored in server memory with a browser-local copy. Restarting the
backend loses its conversation context. Imported RDF data is stored in Fuseki's
Docker volume.

## Verification

```bash
cd backend
./mvnw verify
```

This runs the Java tests and builds the executable JAR. JaCoCo coverage is written
to `backend/target/site/jacoco/`.

```bash
cd frontend
npm ci
npm test
npm run build
npm run lint
```

The frontend build checks TypeScript, including unused variables and parameters.
Lint is a separate check; it currently reports existing typing issues. Passing
unit tests does not validate the full import, chat, calculation and export path.

## License

[MIT](LICENSE).
