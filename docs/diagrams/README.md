# UML Diagrams - CIM-SemanticGraph-Platform

This directory contains professional UML diagrams for the CIM-SemanticGraph-Platform project.

## 📊 Available Diagrams

| Diagram | File | Description |
|---------|------|-------------|
| **Use Case Diagram** | `use-case-diagram.puml` | Shows all system use cases and actors |
| **Class Diagram** | `class-diagram.puml` | Complete Spring Boot backend architecture |
| **Sequence Diagram (GraphRAG)** | `sequence-graphrag-flow.puml` | GraphRAG query flow with Claude AI |
| **Sequence Diagram (CIM Import)** | `sequence-cim-import.puml` | CIM data import and transformation |
| **Component Diagram** | `component-diagram.puml` | System architecture and components |

---

## 🚀 How to Generate Images

### ✅ **Method 1: Online (Easiest)** ⭐ Recommended

1. Open https://www.plantuml.com/plantuml/uml/
2. Copy the content of any `.puml` file
3. Paste it into the text area
4. Click "Submit" or press Ctrl+Enter
5. **Download the image:**
   - Right-click on the diagram
   - "Save image as..." → PNG
   - Or change URL ending to get SVG: `/svg/` instead of `/png/`

**Example for high-quality SVG:**
```
https://www.plantuml.com/plantuml/svg/[encoded-diagram]
```

---

### ✅ **Method 2: VS Code (For Development)**

1. Install **PlantUML extension** by jebbs
   - Open VS Code
   - Go to Extensions (Ctrl+Shift+X)
   - Search "PlantUML"
   - Install

2. Open any `.puml` file

3. **Preview:**
   - Press `Alt+D` to preview
   - Or right-click → "Preview Current Diagram"

4. **Export:**
   - Right-click on diagram
   - "Export Current Diagram"
   - Choose format: PNG, SVG, PDF

---

### ✅ **Method 3: IntelliJ IDEA**

1. Install **PlantUML Integration** plugin
   - Settings → Plugins
   - Search "PlantUML Integration"
   - Install and restart

2. Open `.puml` file → Auto preview on the right

3. Right-click → "Copy Diagram to Clipboard as PNG/SVG"

---

### ✅ **Method 4: Command Line (Advanced)**

Install PlantUML locally:

```bash
# Mac
brew install plantuml

# Generate all diagrams
plantuml docs/diagrams/*.puml

# Generate specific diagram in SVG
plantuml -tsvg docs/diagrams/class-diagram.puml

# Generate all in PNG
plantuml -tpng docs/diagrams/*.puml
```

**Output:** Generated images will be in the same directory.

---

## 📁 Recommended Image Export Settings

For **Bachelor Thesis Report** (FH Aachen):

- **Format:** SVG (vector - best quality) or PNG (high DPI)
- **Resolution:** 300 DPI for PNG
- **Size:** Scale to fit A4 page width (~18cm)

### Export Tips:

1. **For LaTeX reports:**
   ```latex
   \includegraphics[width=\textwidth]{diagrams/class-diagram.png}
   ```

2. **For Word/PowerPoint:**
   - Use SVG for best quality
   - Or PNG at 300 DPI minimum

3. **For presentations:**
   - PNG or SVG
   - White background recommended

---

## 🎨 Diagram Themes

All diagrams use the **vibrant** theme for professional appearance.

To change theme, edit the second line of any `.puml` file:

```plantuml
!theme vibrant        # Current (colorful)
!theme plain          # Simple black & white
!theme blueprint      # Technical blueprint style
!theme sketchy        # Hand-drawn style
```

---

## 📝 Modifying Diagrams

All diagrams are in **PlantUML text format** - easy to edit!

### Example: Adding a new use case

Edit `use-case-diagram.puml`:

```plantuml
usecase "My New Use Case" as UC22
Engineer --> UC22
```

### Example: Adding a new class

Edit `class-diagram.puml`:

```plantuml
class MyNewService {
  - field: String
  + method(): void
}

MyController --> MyNewService
```

---

## 🔗 PlantUML Documentation

- **Official Guide:** https://plantuml.com/
- **Use Case Diagram:** https://plantuml.com/use-case-diagram
- **Class Diagram:** https://plantuml.com/class-diagram
- **Sequence Diagram:** https://plantuml.com/sequence-diagram
- **Component Diagram:** https://plantuml.com/component-diagram

---

## 💡 Tips for Your Thesis

### For Documentation:

1. **Introduction Chapter:** Use Case Diagram
2. **Architecture Chapter:** Component + Class Diagrams
3. **Implementation Chapter:** Sequence Diagrams

### For Presentation:

- Start with Component Diagram (big picture)
- Show Use Cases (what it does)
- Deep dive with Sequence Diagrams (how it works)
- Reference Class Diagram for questions

---

## ✅ Quick Start Checklist

- [ ] Open https://www.plantuml.com/plantuml/uml/
- [ ] Copy content from `use-case-diagram.puml`
- [ ] Paste and submit
- [ ] Download PNG/SVG
- [ ] Repeat for other diagrams
- [ ] Add to your thesis document

---

## 🎯 For FH Aachen Standards

These diagrams follow:
- ✅ UML 2.5 standard notation
- ✅ German engineering documentation practices
- ✅ Clear, professional appearance
- ✅ Suitable for academic reports

---

## 📞 Need Help?

If you need to modify diagrams or add new ones:

1. Check PlantUML documentation (links above)
2. Use the online editor for quick testing
3. Copy existing patterns from these diagrams

---

**Generated for:** CIM-SemanticGraph-Platform Bachelor Thesis
**Institution:** FH Aachen University of Applied Sciences
**Format:** PlantUML (Industry Standard)
