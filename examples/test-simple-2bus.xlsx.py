#!/usr/bin/env python3
"""
Simple 2-Bus Test Network
Minimal network for basic testing
"""

import pandas as pd

# Substations
substations = pd.DataFrame([
    {"id": "SUB_1", "name": "Substation 1", "region": "Test"},
    {"id": "SUB_2", "name": "Substation 2", "region": "Test"},
])

# Buses
buses = pd.DataFrame([
    {"id": "BUS_1", "name": "Bus 1", "voltage": 220, "substation": "SUB_1", "type": "SLACK"},
    {"id": "BUS_2", "name": "Bus 2", "voltage": 220, "substation": "SUB_2", "type": "PQ"},
])

# Lines
lines = pd.DataFrame([
    {"id": "LINE_1_2", "name": "Line 1-2", "from": "BUS_1", "to": "BUS_2", "r": 0.01, "x": 0.10, "b": 0.002, "length": 50, "ratedCurrent": 1000},
])

# Generators
generators = pd.DataFrame([
    {"id": "GEN_1", "name": "Generator 1", "bus": "BUS_1", "p": 100, "pMin": 0, "pMax": 200, "qMin": -50, "qMax": 50, "v": 1.02},
])

# Loads
loads = pd.DataFrame([
    {"id": "LOAD_2", "name": "Load 2", "bus": "BUS_2", "p": 80, "q": 30, "category": "Test"},
])

# Voltage Levels
voltage_levels = pd.DataFrame([
    {"id": "VL_220", "name": "220kV", "voltage": 220},
])

# Create Excel
with pd.ExcelWriter("test-simple-2bus.xlsx", engine='openpyxl') as writer:
    substations.to_excel(writer, sheet_name='Substations', index=False)
    buses.to_excel(writer, sheet_name='Buses', index=False)
    lines.to_excel(writer, sheet_name='Lines', index=False)
    generators.to_excel(writer, sheet_name='Generators', index=False)
    loads.to_excel(writer, sheet_name='Loads', index=False)
    voltage_levels.to_excel(writer, sheet_name='Voltage Levels', index=False)

print("✅ Created: test-simple-2bus.xlsx")
