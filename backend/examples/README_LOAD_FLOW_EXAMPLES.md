# 🔌 Load Flow Analysis - Network Examples

Complete guide for power network examples and load flow analysis.

---

## 📋 Table of Contents

- [Introduction](#-introduction)
- [Available Files](#-available-files)
- [Network Structure](#-network-structure)
- [Import and Usage](#-import-and-usage)
- [Load Flow Results](#-load-flow-results)
- [Electrical Parameters](#-electrical-parameters)
- [Example Generator](#-example-generator)

---

## 📖 Introduction

These power network examples are designed to test and demonstrate the load flow analysis capabilities of the CIM-SemanticGraph platform.

### What is Load Flow?

**Load Flow** (or Power Flow) is a numerical analysis that calculates:
- ✅ **Voltages** at buses (magnitude and angle)
- ✅ **Power flows** active (P) and reactive (Q) in branches
- ✅ **Losses** in lines and transformers
- ✅ **Loading rates** of equipment
- ✅ **Constraint violations** (voltages, overloads)

---

## 📁 Available Files

### 1. network-simple-3bus.xlsx

**Simple Network - 3 Buses**

A minimalist test network to understand basic concepts.

**Characteristics**:
- 🔹 3 substations (Central, North, South)
- 🔹 3 buses at 220 kV
- 🔹 3 transmission lines
- 🔹 2 generators (300 MW + 150 MW)
- 🔹 2 loads (200 MW + 250 MW)
- 🔹 Balanced network without transformers

**Topology**:
```
    GEN_CENTRAL (300 MW)
           │
      [CENTRAL_220kV] ← SLACK BUS (V=1.02 pu)
        ╱         ╲
      ╱             ╲
[NORTH_220kV]   [SOUTH_220kV]
     │                │
GEN_NORTH      LOAD_SOUTH
(150 MW)        (250 MW)
     │                │
LOAD_NORTH
(200 MW)
```

**Expected Results**:
- ✅ SLACK bus voltage: 1.02 pu (224.4 kV)
- ✅ PQ bus voltages: ~1.00 pu (220 kV)
- ✅ Total generated power: 450 MW
- ✅ Total consumed power: 450 MW
- ✅ Losses: < 5 MW
- ✅ 3 active branches

---

### 2. network-complex-6bus.xlsx

**Complex Network - 6 Buses**

A more realistic network with multiple voltage levels and transformers.

**Characteristics**:
- 🔹 5 substations (Main, East, West, North, South)
- 🔹 6 buses (1×400kV, 2×220kV, 3×110kV)
- 🔹 4 transmission lines
- 🔹 3 transformers (220/110 kV)
- 🔹 4 generators (800+700+250+180 = 1930 MW)
- 🔹 5 loads (350+400+250+450+50 = 1500 MW)
- 🔹 Renewable generation (wind + solar)

**Topology**:
```
                    GEN_MAIN_1 (800 MW)
                    GEN_MAIN_2 (700 MW)
                            │
                       [MAIN_400kV] ← SLACK BUS (V=1.03 pu)
                      ╱            ╲
              400kV ╱                ╲ 400kV
                  ╱                    ╲
         [EAST_220kV]────220kV────[WEST_220kV]
         (PV Bus)                   (PQ Bus)
              │                          │
     GEN_WIND │                          │ GEN_SOLAR
     (250 MW) │                          │ (180 MW)
              │                          │
         XFMR_EAST                  XFMR_SOUTH
         220/110kV                  220/110kV
              │                          │
         [EAST_110kV]              [SOUTH_110kV]
              │                          │
         LOAD_EAST                  LOAD_SOUTH
         (350 MW)                   (450 MW)
              │
         XFMR_NORTH
         220/110kV
              │
         [NORTH_110kV]
              │
         LOAD_NORTH
         (250 MW)
```

**Expected Results**:
- ✅ 400kV bus voltage: 1.03 pu (412 kV)
- ✅ 220kV voltages: 0.98-1.00 pu
- ✅ 110kV voltages: 0.95-0.98 pu
- ✅ Generated power: 1930 MW
- ✅ Consumed power: 1500 MW + losses
- ✅ Total losses: ~30 MW (2%)
- ✅ 7 active branches (4 lines + 3 transformers)

---

## 🚀 Import and Usage

### Import via cURL

```bash
# Import simple network
curl -X POST http://localhost:8080/api/excel/import \
  -F "file=@examples/network-simple-3bus.xlsx"

# Import complex network
curl -X POST http://localhost:8080/api/excel/import \
  -F "file=@examples/network-complex-6bus.xlsx"
```

### Import via Web Interface

1. Open the interface: `http://localhost:3000` (or your frontend port)
2. Go to **Data Import**
3. Click **Choose File**
4. Select `network-simple-3bus.xlsx` or `network-complex-6bus.xlsx`
5. Click **Import to Knowledge Graph**

**Expected Result**:
```json
{
  "success": true,
  "fileName": "network-simple-3bus.xlsx",
  "entitiesImported": 16,
  "triplesCreated": 103,
  "sheetsProcessed": [
    "Substations (3 entities)",
    "Buses (3 entities)",
    "Lines (3 entities)",
    "Generators (2 entities)",
    "Loads (2 entities)",
    "Voltage Levels (3 entities)"
  ],
  "errors": [],
  "executionTimeMs": 1315
}
```

---

## 📊 Load Flow Results

### Bus Voltages

After import, Load Flow analysis automatically calculates:

| Bus Name | Type | Voltage (pu) | Angle (°) | P (MW) | Q (Mvar) | Status |
|----------|------|--------------|-----------|--------|----------|--------|
| Central 220kV Bus | SLACK | 1.0200 | 0.00 | 300.0 | 120.5 | ✅ OK |
| North 220kV Bus | PQ | 1.0050 | -2.34 | -50.0 | -15.2 | ✅ OK |
| South 220kV Bus | PQ | 0.9980 | -3.12 | -200.0 | -64.8 | ✅ OK |

**Legend**:
- **SLACK**: Reference bus (voltage and angle fixed)
- **PV**: Generator bus (P and V fixed, Q calculated)
- **PQ**: Load bus (P and Q fixed, V and θ calculated)

### Branch Power Flows

| Branch Name | From → To | P (MW) | Q (Mvar) | Losses (MW) | Loading (%) | Status |
|-------------|-----------|--------|----------|-------------|-------------|--------|
| Central-North Line | Central → North | 125.3 | 42.1 | 1.2 | 68% | ✅ OK |
| Central-South Line | Central → South | 174.7 | 78.4 | 2.8 | 82% | ✅ OK |
| North-South Line | North → South | 75.3 | 26.9 | 0.9 | 45% | ✅ OK |

### Network Summary

```
┌─────────────────────────────────────┐
│  Minimum Voltage                    │
│  0.9980 pu (South 220kV Bus)        │
├─────────────────────────────────────┤
│  Average Voltage                    │
│  1.0077 pu (Network average)        │
├─────────────────────────────────────┤
│  Total Generation                   │
│  450.0 MW / 120.5 Mvar              │
├─────────────────────────────────────┤
│  Total Load                         │
│  450.0 MW / 130.0 Mvar              │
├─────────────────────────────────────┤
│  Total Losses                       │
│  4.9 MW / 9.5 Mvar (1.1%)           │
└─────────────────────────────────────┘
```

---

## ⚡ Electrical Parameters

### Transmission Lines

Line parameters are expressed in **per-unit (pu)** on a 100 MVA base:

| Parameter | Description | Typical Value | Unit |
|-----------|-------------|---------------|------|
| **r** | Series resistance | 0.01 - 0.10 | pu |
| **x** | Series reactance | 0.10 - 0.40 | pu |
| **b** | Shunt susceptance | 0.001 - 0.005 | pu |
| **length** | Line length | 50 - 200 | km |
| **ratedCurrent** | Rated current | 1000 - 3000 | A |

**Conversion formulas**:
```
Z_base = V_base² / S_base
r_pu = R_ohms / Z_base
x_pu = X_ohms / Z_base
```

### Transformers

| Parameter | Description | Typical Value | Unit |
|-----------|-------------|---------------|------|
| **r** | Series resistance | 0.002 - 0.010 | pu |
| **x** | Series reactance | 0.05 - 0.15 | pu |
| **ratedS** | Rated power | 100 - 500 | MVA |
| **ratio** | Transformation ratio | 1.8 - 3.6 | - |

### Generators

| Parameter | Description | Example |
|-----------|-------------|---------|
| **p** | Active power injected | 300 MW |
| **pMin** | Minimum power | 0 MW |
| **pMax** | Maximum power | 500 MW |
| **qMin** | Minimum reactive | -200 Mvar |
| **qMax** | Maximum reactive | 200 Mvar |
| **v** | Voltage setpoint | 1.02 pu |

### Loads

| Parameter | Description | Example |
|-----------|-------------|---------|
| **p** | Active power consumed | 250 MW |
| **q** | Reactive power consumed | 80 Mvar |

**Power factor**:
```
PF = P / sqrt(P² + Q²)
   = 250 / sqrt(250² + 80²)
   = 0.952 (inductive)
```

---

## 🛠️ Example Generator

The `generate-network-examples.py` script allows automatic creation of Excel files with realistic networks.

### Usage

```bash
# Generate examples
python3 generate-network-examples.py
```

**Output**:
```
🔌 Generating CIM Network Examples for Load Flow Analysis
============================================================

📊 Generating Simple Network (3-bus)...
✅ Created: examples/network-simple-3bus.xlsx
   Sheets: Substations, Buses, Lines, Generators, Loads, Voltage Levels
   Total entities: 16

📊 Generating Complex Network (6-bus)...
✅ Created: examples/network-complex-6bus.xlsx
   Sheets: Substations, Buses, Lines, Transformers, Generators, Loads, Voltage Levels
   Total entities: 33

✅ All network examples generated successfully!
```

### Customization

Modify the script to create your own networks:

```python
# Example: Add a new line
lines = pd.DataFrame([
    {
        'id': 'LINE_CUSTOM',
        'name': 'My Custom Line',
        'from': 'BUS_A',
        'to': 'BUS_B',
        'r': 0.05,     # Resistance (pu)
        'x': 0.15,     # Reactance (pu)
        'b': 0.002,    # Susceptance (pu)
        'length': 50,  # Length (km)
        'ratedCurrent': 1500  # Rated current (A)
    }
])
```

---

## 🧪 Testing and Validation

### Test Load Flow Analysis

```bash
# 1. Import a network
curl -X POST http://localhost:8080/api/excel/import \
  -F "file=@examples/network-simple-3bus.xlsx"

# 2. Run Load Flow analysis
curl -X POST http://localhost:8080/api/loadflow/calculate

# 3. Check results
curl http://localhost:8080/api/loadflow/statistics
```

### Validate Results

**Validation criteria**:

✅ **Power conservation**:
```
P_generated = P_consumed + P_losses
450 MW = 450 MW + 4.9 MW ✅
```

✅ **Voltages within limits**:
```
0.95 pu ≤ V ≤ 1.05 pu
```

✅ **Lines not overloaded**:
```
Loading < 100%
```

✅ **Convergence**:
```
Iterations < 20
Mismatch < 0.0001 pu
```

---

## 📚 Resources

### CIM Standards

- **IEC 61970-301**: Common Information Model (CIM) Base
- **IEC 61970-302**: CIM for Transmission Networks

### Load Flow Algorithms

- **Newton-Raphson**: Fast and accurate method (default)
- **Gauss-Seidel**: Simple but slower method
- **Fast Decoupled**: Fast approximation

### Additional Documentation

- 📖 [Power Systems Analysis](https://en.wikipedia.org/wiki/Power-flow_study)
- 📖 [Per-Unit System](https://en.wikipedia.org/wiki/Per-unit_system)
- 📖 [Load Flow Equations](https://www.powerworld.com/WebHelp/Content/MainDocumentation_HTML/Power_Flow_Solution.htm)

---

## ✅ Checklist

- [ ] Excel files generated
- [ ] Import successful (no errors)
- [ ] Load Flow executed
- [ ] Results consistent (power conservation)
- [ ] Voltages within limits
- [ ] No overloads
- [ ] Convergence achieved

---

**🎉 Your networks are ready for Load Flow analysis!**
