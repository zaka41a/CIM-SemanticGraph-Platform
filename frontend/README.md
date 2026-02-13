# CIM-SemanticGraph-Platform Frontend

Ultra-professional React frontend with blue & gold theme for the CIM Knowledge Graph Platform.

## 🎨 **Design Theme**

- **Primary Color:** Deep Blue (#1e40af, #3b82f6)
- **Accent Color:** Gold (#eab308, #facc15)
- **Background:** Dark Navy gradient with glass-morphism effects
- **Typography:** Inter (body), Poppins (headings)

## 🚀 **Features**

### 1. Dashboard
- Real-time Knowledge Graph statistics
- Interactive graph visualization using Cytoscape.js
- Beautiful stat cards with gradient backgrounds
- System information overview

### 2. GraphRAG Chat
- Natural language interface for querying the Knowledge Graph
- Chat-style UI with user/assistant messages
- Source attribution and confidence scores
- Sample questions for quick start

### 3. SPARQL Editor
- Monaco Editor with SPARQL syntax highlighting
- Sample queries sidebar
- Execute queries and view results in table format
- Download results as JSON
- Copy query to clipboard

### 4. Data Import
- Drag & drop file upload
- Support for CIM/XML, CIM/RDF, RDF/XML, TURTLE formats
- Import statistics display
- Step-by-step process explanation

## 📦 **Tech Stack**

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool & dev server
- **TailwindCSS** - Styling framework
- **React Router** - Routing
- **Axios** - HTTP client
- **Cytoscape.js** - Graph visualization
- **Monaco Editor** - Code editor
- **Lucide React** - Icon library
- **Framer Motion** - Animations

## 🛠️ **Installation**

### Prerequisites
- Node.js 18+ and npm

### Install Dependencies
```bash
cd frontend
npm install
```

## 🚀 **Development**

### Start Development Server
```bash
npm run dev
```

The app will be available at `http://localhost:3000`

### Environment Variables
Create a `.env` file:
```bash
VITE_API_URL=http://localhost:8080/api
```

## 🏗️ **Build for Production**

```bash
npm run build
```

Build output will be in `dist/` directory.

### Preview Production Build
```bash
npm run preview
```

## 🐳 **Docker Deployment**

### Build Docker Image
```bash
docker build -t cim-frontend .
```

### Run Container
```bash
docker run -p 3000:80 cim-frontend
```

### With Custom API URL
```bash
docker build --build-arg VITE_API_URL=http://your-api:8080/api -t cim-frontend .
```

## 🎯 **Component Structure**

```
src/
├── components/
│   ├── Layout.tsx              # Main layout with sidebar & header
│   └── GraphVisualization.tsx  # Cytoscape graph component
├── pages/
│   ├── Dashboard.tsx           # Dashboard page
│   ├── GraphRAGChat.tsx        # Chat interface
│   ├── SparqlEditor.tsx        # SPARQL editor
│   └── DataImport.tsx          # Data import page
├── services/
│   └── api.ts                  # API service layer
├── types/
│   └── index.ts                # TypeScript types
├── styles/
│   └── index.css               # Global styles & Tailwind
├── App.tsx                     # Main app component
└── main.tsx                    # Entry point
```

## 🎨 **Design System**

### Colors
```css
/* Blue Theme */
primary-500: #3b82f6
primary-600: #2563eb
primary-700: #1d4ed8

/* Gold Theme */
gold-400: #facc15
gold-500: #eab308
gold-600: #ca8a04

/* Navy Background */
navy-900: #0c4a6e
navy-950: #082f49
```

### Components
- `.card` - Glass card with border
- `.card-hover` - Interactive card
- `.btn-primary` - Gold gradient button
- `.btn-secondary` - Blue gradient button
- `.btn-outline` - Outlined button
- `.input-field` - Styled input
- `.section-header` - Page headers
- `.badge-gold` - Gold badge
- `.badge-blue` - Blue badge

## 📱 **Responsive Design**

- Mobile-first approach
- Responsive grid layouts
- Collapsible sidebar on mobile
- Touch-friendly interfaces

## 🔧 **API Integration**

All API calls go through the `apiService` in `src/services/api.ts`:

```typescript
import { apiService } from '@/services/api';

// Example usage
const stats = await apiService.getStatistics();
const response = await apiService.askGraphRAG(question);
```

## 🎓 **For Your Bachelor Thesis**

This frontend demonstrates:
- ✅ Professional UI/UX design
- ✅ Modern React patterns (Hooks, TypeScript)
- ✅ Clean architecture (separation of concerns)
- ✅ Real-time data visualization
- ✅ Natural language interface for LLM
- ✅ Docker deployment ready
- ✅ Production-ready code quality

## 📝 **License**

Part of the CIM-SemanticGraph-Platform Bachelor project.
