#!/usr/bin/env python3
"""
NRW Power Network Generator
Generates a comprehensive Excel file for the NRW (Nordrhein-Westfalen) power grid.
"""

import pandas as pd
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils.dataframe import dataframe_to_rows

# ============================================================================
# SUBSTATIONS - Major NRW Grid Nodes
# ============================================================================
substations = pd.DataFrame([
    # Major Cities - 380kV/220kV Hubs
    {"id": "SUB_BRAUWEILER", "name": "Brauweiler (Amprion Hub)", "region": "Köln", "description": "Main control center near Cologne"},
    {"id": "SUB_DORTMUND", "name": "Dortmund West", "region": "Ruhrgebiet", "description": "Ruhr area hub"},
    {"id": "SUB_DUISBURG", "name": "Duisburg Stahlwerk", "region": "Ruhrgebiet", "description": "Industrial steel zone"},
    {"id": "SUB_ESSEN", "name": "Essen Zentral", "region": "Ruhrgebiet", "description": "Central Ruhr distribution"},
    {"id": "SUB_DUSSELDORF", "name": "Düsseldorf Nord", "region": "Düsseldorf", "description": "State capital hub"},
    {"id": "SUB_KOLN", "name": "Köln Süd", "region": "Köln", "description": "Cologne southern hub"},
    {"id": "SUB_BONN", "name": "Bonn Rheinaue", "region": "Bonn", "description": "Former capital distribution"},
    {"id": "SUB_AACHEN", "name": "Aachen West", "region": "Aachen", "description": "Western border interconnection"},
    {"id": "SUB_MUNSTER", "name": "Münster Nord", "region": "Münsterland", "description": "Northern NRW hub"},
    {"id": "SUB_BIELEFELD", "name": "Bielefeld Ost", "region": "OWL", "description": "East Westphalia hub"},
    {"id": "SUB_PADERBORN", "name": "Paderborn Wind", "region": "OWL", "description": "Wind energy collection"},
    {"id": "SUB_WESEL", "name": "Wesel Niederrhein", "region": "Niederrhein", "description": "Netherlands interconnection"},
    {"id": "SUB_HAMM", "name": "Hamm Ost", "region": "Ruhrgebiet", "description": "Eastern Ruhr node"},
    {"id": "SUB_WUPPERTAL", "name": "Wuppertal Berg", "region": "Bergisches Land", "description": "Bergisches Land hub"},
    {"id": "SUB_NEUSS", "name": "Neuss Hafen", "region": "Düsseldorf", "description": "Industrial port area"},
    # Power Plant Sites
    {"id": "SUB_NEURATH", "name": "Neurath Kraftwerk", "region": "Grevenbroich", "description": "Lignite power plant site"},
    {"id": "SUB_NIEDERAUSSEM", "name": "Niederaussem Kraftwerk", "region": "Bergheim", "description": "Lignite power plant site"},
    {"id": "SUB_WEISWEILER", "name": "Weisweiler Kraftwerk", "region": "Eschweiler", "description": "Lignite power plant site"},
])

# ============================================================================
# BUSES - Network Nodes at Different Voltage Levels
# ============================================================================
buses = pd.DataFrame([
    # 380kV Buses (Extra High Voltage - Transport)
    {"id": "BUS_BRAUWEILER_380", "name": "Brauweiler 380kV", "voltage": 380, "substation": "SUB_BRAUWEILER", "type": "SLACK", "v_setpoint": 1.02},
    {"id": "BUS_DORTMUND_380", "name": "Dortmund 380kV", "voltage": 380, "substation": "SUB_DORTMUND", "type": "PQ", "v_setpoint": 1.00},
    {"id": "BUS_WESEL_380", "name": "Wesel 380kV", "voltage": 380, "substation": "SUB_WESEL", "type": "PQ", "v_setpoint": 1.00},
    {"id": "BUS_AACHEN_380", "name": "Aachen 380kV", "voltage": 380, "substation": "SUB_AACHEN", "type": "PQ", "v_setpoint": 1.00},
    
    # 220kV Buses (High Voltage - Sub-transmission)
    {"id": "BUS_DUSSELDORF_220", "name": "Düsseldorf 220kV", "voltage": 220, "substation": "SUB_DUSSELDORF", "type": "PV", "v_setpoint": 1.01},
    {"id": "BUS_KOLN_220", "name": "Köln 220kV", "voltage": 220, "substation": "SUB_KOLN", "type": "PQ", "v_setpoint": 1.00},
    {"id": "BUS_ESSEN_220", "name": "Essen 220kV", "voltage": 220, "substation": "SUB_ESSEN", "type": "PQ", "v_setpoint": 1.00},
    {"id": "BUS_DUISBURG_220", "name": "Duisburg 220kV", "voltage": 220, "substation": "SUB_DUISBURG", "type": "PQ", "v_setpoint": 1.00},
    {"id": "BUS_BONN_220", "name": "Bonn 220kV", "voltage": 220, "substation": "SUB_BONN", "type": "PQ", "v_setpoint": 1.00},
    {"id": "BUS_MUNSTER_220", "name": "Münster 220kV", "voltage": 220, "substation": "SUB_MUNSTER", "type": "PQ", "v_setpoint": 1.00},
    {"id": "BUS_BIELEFELD_220", "name": "Bielefeld 220kV", "voltage": 220, "substation": "SUB_BIELEFELD", "type": "PQ", "v_setpoint": 1.00},
    {"id": "BUS_PADERBORN_220", "name": "Paderborn 220kV", "voltage": 220, "substation": "SUB_PADERBORN", "type": "PV", "v_setpoint": 1.01},
    {"id": "BUS_HAMM_220", "name": "Hamm 220kV", "voltage": 220, "substation": "SUB_HAMM", "type": "PQ", "v_setpoint": 1.00},
    {"id": "BUS_WUPPERTAL_220", "name": "Wuppertal 220kV", "voltage": 220, "substation": "SUB_WUPPERTAL", "type": "PQ", "v_setpoint": 1.00},
    {"id": "BUS_NEUSS_220", "name": "Neuss 220kV", "voltage": 220, "substation": "SUB_NEUSS", "type": "PQ", "v_setpoint": 1.00},
    
    # 110kV Buses (Distribution)
    {"id": "BUS_DUSSELDORF_110", "name": "Düsseldorf 110kV", "voltage": 110, "substation": "SUB_DUSSELDORF", "type": "PQ", "v_setpoint": 1.00},
    {"id": "BUS_KOLN_110", "name": "Köln 110kV", "voltage": 110, "substation": "SUB_KOLN", "type": "PQ", "v_setpoint": 1.00},
    {"id": "BUS_ESSEN_110", "name": "Essen 110kV", "voltage": 110, "substation": "SUB_ESSEN", "type": "PQ", "v_setpoint": 1.00},
    {"id": "BUS_DORTMUND_110", "name": "Dortmund 110kV", "voltage": 110, "substation": "SUB_DORTMUND", "type": "PQ", "v_setpoint": 1.00},
    {"id": "BUS_DUISBURG_110", "name": "Duisburg 110kV", "voltage": 110, "substation": "SUB_DUISBURG", "type": "PQ", "v_setpoint": 1.00},
    {"id": "BUS_BONN_110", "name": "Bonn 110kV", "voltage": 110, "substation": "SUB_BONN", "type": "PQ", "v_setpoint": 1.00},
    
    # Power Plant Buses
    {"id": "BUS_NEURATH_380", "name": "Neurath 380kV", "voltage": 380, "substation": "SUB_NEURATH", "type": "PV", "v_setpoint": 1.03},
    {"id": "BUS_NIEDERAUSSEM_380", "name": "Niederaussem 380kV", "voltage": 380, "substation": "SUB_NIEDERAUSSEM", "type": "PV", "v_setpoint": 1.02},
    {"id": "BUS_WEISWEILER_220", "name": "Weisweiler 220kV", "voltage": 220, "substation": "SUB_WEISWEILER", "type": "PV", "v_setpoint": 1.02},
])

# ============================================================================
# LINES - Transmission Lines
# ============================================================================
lines = pd.DataFrame([
    # 380kV Lines (Backbone)
    {"id": "LINE_BRAU_DORT_380", "name": "Brauweiler-Dortmund 380kV", "from": "BUS_BRAUWEILER_380", "to": "BUS_DORTMUND_380", "r": 0.005, "x": 0.05, "b": 0.002, "length": 85, "ratedCurrent": 3000},
    {"id": "LINE_BRAU_WESEL_380", "name": "Brauweiler-Wesel 380kV", "from": "BUS_BRAUWEILER_380", "to": "BUS_WESEL_380", "r": 0.004, "x": 0.04, "b": 0.0018, "length": 70, "ratedCurrent": 3000},
    {"id": "LINE_BRAU_AACHEN_380", "name": "Brauweiler-Aachen 380kV", "from": "BUS_BRAUWEILER_380", "to": "BUS_AACHEN_380", "r": 0.004, "x": 0.045, "b": 0.0015, "length": 65, "ratedCurrent": 3000},
    {"id": "LINE_WESEL_DORT_380", "name": "Wesel-Dortmund 380kV", "from": "BUS_WESEL_380", "to": "BUS_DORTMUND_380", "r": 0.006, "x": 0.06, "b": 0.0022, "length": 95, "ratedCurrent": 3000},
    {"id": "LINE_NEURATH_BRAU_380", "name": "Neurath-Brauweiler 380kV", "from": "BUS_NEURATH_380", "to": "BUS_BRAUWEILER_380", "r": 0.002, "x": 0.02, "b": 0.001, "length": 25, "ratedCurrent": 4000},
    {"id": "LINE_NIEDER_BRAU_380", "name": "Niederaussem-Brauweiler 380kV", "from": "BUS_NIEDERAUSSEM_380", "to": "BUS_BRAUWEILER_380", "r": 0.002, "x": 0.025, "b": 0.001, "length": 30, "ratedCurrent": 4000},
    
    # 220kV Lines (Regional)
    {"id": "LINE_DUS_KOLN_220", "name": "Düsseldorf-Köln 220kV", "from": "BUS_DUSSELDORF_220", "to": "BUS_KOLN_220", "r": 0.01, "x": 0.08, "b": 0.003, "length": 45, "ratedCurrent": 2000},
    {"id": "LINE_DUS_ESSEN_220", "name": "Düsseldorf-Essen 220kV", "from": "BUS_DUSSELDORF_220", "to": "BUS_ESSEN_220", "r": 0.008, "x": 0.07, "b": 0.0025, "length": 35, "ratedCurrent": 2000},
    {"id": "LINE_ESSEN_DUIS_220", "name": "Essen-Duisburg 220kV", "from": "BUS_ESSEN_220", "to": "BUS_DUISBURG_220", "r": 0.005, "x": 0.04, "b": 0.0015, "length": 20, "ratedCurrent": 2000},
    {"id": "LINE_KOLN_BONN_220", "name": "Köln-Bonn 220kV", "from": "BUS_KOLN_220", "to": "BUS_BONN_220", "r": 0.007, "x": 0.06, "b": 0.002, "length": 30, "ratedCurrent": 2000},
    {"id": "LINE_ESSEN_HAMM_220", "name": "Essen-Hamm 220kV", "from": "BUS_ESSEN_220", "to": "BUS_HAMM_220", "r": 0.012, "x": 0.10, "b": 0.0035, "length": 55, "ratedCurrent": 2000},
    {"id": "LINE_HAMM_BIEL_220", "name": "Hamm-Bielefeld 220kV", "from": "BUS_HAMM_220", "to": "BUS_BIELEFELD_220", "r": 0.015, "x": 0.12, "b": 0.004, "length": 70, "ratedCurrent": 2000},
    {"id": "LINE_BIEL_PADER_220", "name": "Bielefeld-Paderborn 220kV", "from": "BUS_BIELEFELD_220", "to": "BUS_PADERBORN_220", "r": 0.01, "x": 0.08, "b": 0.003, "length": 45, "ratedCurrent": 2000},
    {"id": "LINE_MUNSTER_HAMM_220", "name": "Münster-Hamm 220kV", "from": "BUS_MUNSTER_220", "to": "BUS_HAMM_220", "r": 0.008, "x": 0.07, "b": 0.0025, "length": 40, "ratedCurrent": 2000},
    {"id": "LINE_DUS_WUPP_220", "name": "Düsseldorf-Wuppertal 220kV", "from": "BUS_DUSSELDORF_220", "to": "BUS_WUPPERTAL_220", "r": 0.007, "x": 0.06, "b": 0.002, "length": 30, "ratedCurrent": 2000},
    {"id": "LINE_DUS_NEUSS_220", "name": "Düsseldorf-Neuss 220kV", "from": "BUS_DUSSELDORF_220", "to": "BUS_NEUSS_220", "r": 0.003, "x": 0.025, "b": 0.001, "length": 10, "ratedCurrent": 2000},
    {"id": "LINE_WEIS_KOLN_220", "name": "Weisweiler-Köln 220kV", "from": "BUS_WEISWEILER_220", "to": "BUS_KOLN_220", "r": 0.012, "x": 0.10, "b": 0.0035, "length": 60, "ratedCurrent": 2500},
])

# ============================================================================
# TRANSFORMERS - Step-down Transformers
# ============================================================================
transformers = pd.DataFrame([
    # 380/220kV Transformers
    {"id": "TRAFO_BRAU_380_220", "name": "Brauweiler 380/220kV", "hv_bus": "BUS_BRAUWEILER_380", "lv_bus": "BUS_DUSSELDORF_220", "rated_s": 800, "r": 0.002, "x": 0.10, "ratio": 1.73},
    {"id": "TRAFO_DORT_380_220", "name": "Dortmund 380/220kV", "hv_bus": "BUS_DORTMUND_380", "lv_bus": "BUS_ESSEN_220", "rated_s": 600, "r": 0.002, "x": 0.10, "ratio": 1.73},
    {"id": "TRAFO_WESEL_380_220", "name": "Wesel 380/220kV", "hv_bus": "BUS_WESEL_380", "lv_bus": "BUS_DUISBURG_220", "rated_s": 500, "r": 0.002, "x": 0.10, "ratio": 1.73},
    
    # 220/110kV Transformers
    {"id": "TRAFO_DUS_220_110", "name": "Düsseldorf 220/110kV", "hv_bus": "BUS_DUSSELDORF_220", "lv_bus": "BUS_DUSSELDORF_110", "rated_s": 300, "r": 0.003, "x": 0.08, "ratio": 2.0},
    {"id": "TRAFO_KOLN_220_110", "name": "Köln 220/110kV", "hv_bus": "BUS_KOLN_220", "lv_bus": "BUS_KOLN_110", "rated_s": 350, "r": 0.003, "x": 0.08, "ratio": 2.0},
    {"id": "TRAFO_ESSEN_220_110", "name": "Essen 220/110kV", "hv_bus": "BUS_ESSEN_220", "lv_bus": "BUS_ESSEN_110", "rated_s": 300, "r": 0.003, "x": 0.08, "ratio": 2.0},
    {"id": "TRAFO_DUIS_220_110", "name": "Duisburg 220/110kV", "hv_bus": "BUS_DUISBURG_220", "lv_bus": "BUS_DUISBURG_110", "rated_s": 400, "r": 0.003, "x": 0.08, "ratio": 2.0},
    {"id": "TRAFO_BONN_220_110", "name": "Bonn 220/110kV", "hv_bus": "BUS_BONN_220", "lv_bus": "BUS_BONN_110", "rated_s": 200, "r": 0.003, "x": 0.08, "ratio": 2.0},
])

# ============================================================================
# GENERATORS - Power Plants
# ============================================================================
generators = pd.DataFrame([
    # Lignite Power Plants (Transitioning)
    {"id": "GEN_NEURATH_1", "name": "Neurath Block F", "bus": "BUS_NEURATH_380", "p": 1100, "pMin": 400, "pMax": 1100, "qMin": -400, "qMax": 500, "v": 1.03, "fuel": "Lignite"},
    {"id": "GEN_NEURATH_2", "name": "Neurath Block G", "bus": "BUS_NEURATH_380", "p": 1100, "pMin": 400, "pMax": 1100, "qMin": -400, "qMax": 500, "v": 1.03, "fuel": "Lignite"},
    {"id": "GEN_NIEDERAUSSEM", "name": "Niederaussem K", "bus": "BUS_NIEDERAUSSEM_380", "p": 1000, "pMin": 350, "pMax": 1000, "qMin": -350, "qMax": 450, "v": 1.02, "fuel": "Lignite"},
    {"id": "GEN_WEISWEILER", "name": "Weisweiler Thermal", "bus": "BUS_WEISWEILER_220", "p": 600, "pMin": 200, "pMax": 600, "qMin": -200, "qMax": 300, "v": 1.02, "fuel": "Lignite"},
    
    # Wind Farms
    {"id": "GEN_WIND_PADERBORN", "name": "Paderborn Wind Cluster", "bus": "BUS_PADERBORN_220", "p": 450, "pMin": 0, "pMax": 600, "qMin": -100, "qMax": 100, "v": 1.01, "fuel": "Wind"},
    {"id": "GEN_WIND_MUNSTER", "name": "Münsterland Wind Park", "bus": "BUS_MUNSTER_220", "p": 280, "pMin": 0, "pMax": 400, "qMin": -80, "qMax": 80, "v": 1.00, "fuel": "Wind"},
    {"id": "GEN_WIND_BIELEFELD", "name": "OWL Wind Farm", "bus": "BUS_BIELEFELD_220", "p": 200, "pMin": 0, "pMax": 300, "qMin": -60, "qMax": 60, "v": 1.00, "fuel": "Wind"},
    
    # Solar Parks
    {"id": "GEN_SOLAR_KOLN", "name": "Köln Solar Park", "bus": "BUS_KOLN_220", "p": 120, "pMin": 0, "pMax": 200, "qMin": -40, "qMax": 40, "v": 1.00, "fuel": "Solar"},
    {"id": "GEN_SOLAR_BONN", "name": "Bonn PV Cluster", "bus": "BUS_BONN_220", "p": 80, "pMin": 0, "pMax": 150, "qMin": -30, "qMax": 30, "v": 1.00, "fuel": "Solar"},
    
    # Gas Turbines (Peak/Backup)
    {"id": "GEN_GAS_DUSSELDORF", "name": "Düsseldorf CCGT", "bus": "BUS_DUSSELDORF_220", "p": 400, "pMin": 100, "pMax": 500, "qMin": -150, "qMax": 200, "v": 1.01, "fuel": "Natural Gas"},
    {"id": "GEN_GAS_ESSEN", "name": "Essen Gas Turbine", "bus": "BUS_ESSEN_220", "p": 300, "pMin": 80, "pMax": 400, "qMin": -120, "qMax": 150, "v": 1.00, "fuel": "Natural Gas"},
])

# ============================================================================
# LOADS - City/Industrial Loads
# ============================================================================
loads = pd.DataFrame([
    # Major Cities (110kV Distribution)
    {"id": "LOAD_DUSSELDORF", "name": "Düsseldorf City Load", "bus": "BUS_DUSSELDORF_110", "p": 650, "q": 200, "category": "City"},
    {"id": "LOAD_KOLN", "name": "Köln City Load", "bus": "BUS_KOLN_110", "p": 850, "q": 280, "category": "City"},
    {"id": "LOAD_ESSEN", "name": "Essen City Load", "bus": "BUS_ESSEN_110", "p": 480, "q": 150, "category": "City"},
    {"id": "LOAD_DORTMUND", "name": "Dortmund City Load", "bus": "BUS_DORTMUND_110", "p": 520, "q": 170, "category": "City"},
    {"id": "LOAD_BONN", "name": "Bonn City Load", "bus": "BUS_BONN_110", "p": 280, "q": 90, "category": "City"},
    
    # Industrial Loads (220kV Direct)
    {"id": "LOAD_DUISBURG_STEEL", "name": "Duisburg Stahlwerk", "bus": "BUS_DUISBURG_220", "p": 800, "q": 350, "category": "Industrial"},
    {"id": "LOAD_NEUSS_INDUSTRY", "name": "Neuss Industrial Zone", "bus": "BUS_NEUSS_220", "p": 400, "q": 150, "category": "Industrial"},
    {"id": "LOAD_HAMM_INDUSTRY", "name": "Hamm Industrial", "bus": "BUS_HAMM_220", "p": 250, "q": 80, "category": "Industrial"},
    
    # Regional Loads (220kV)
    {"id": "LOAD_MUNSTER", "name": "Münster Region", "bus": "BUS_MUNSTER_220", "p": 320, "q": 100, "category": "Regional"},
    {"id": "LOAD_BIELEFELD", "name": "Bielefeld Region", "bus": "BUS_BIELEFELD_220", "p": 350, "q": 110, "category": "Regional"},
    {"id": "LOAD_WUPPERTAL", "name": "Wuppertal City", "bus": "BUS_WUPPERTAL_220", "p": 300, "q": 95, "category": "Regional"},
    {"id": "LOAD_PADERBORN", "name": "Paderborn Region", "bus": "BUS_PADERBORN_220", "p": 180, "q": 55, "category": "Regional"},
    
    # Industrial Duisburg (110kV)
    {"id": "LOAD_DUISBURG_CITY", "name": "Duisburg City Load", "bus": "BUS_DUISBURG_110", "p": 350, "q": 110, "category": "City"},
])

# ============================================================================
# VOLTAGE LEVELS
# ============================================================================
voltage_levels = pd.DataFrame([
    {"id": "VL_380", "name": "380kV Extra High Voltage", "voltage": 380, "description": "Transport level"},
    {"id": "VL_220", "name": "220kV High Voltage", "voltage": 220, "description": "Sub-transmission level"},
    {"id": "VL_110", "name": "110kV High Voltage", "voltage": 110, "description": "Distribution level"},
])

# ============================================================================
# CREATE EXCEL FILE
# ============================================================================
def create_excel():
    output_path = "/Users/zakaria/Documents/CIM-SemanticGraph-Platform/examples/NRW-Power-Network.xlsx"
    
    with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
        substations.to_excel(writer, sheet_name='Substations', index=False)
        buses.to_excel(writer, sheet_name='Buses', index=False)
        lines.to_excel(writer, sheet_name='Lines', index=False)
        transformers.to_excel(writer, sheet_name='Transformers', index=False)
        generators.to_excel(writer, sheet_name='Generators', index=False)
        loads.to_excel(writer, sheet_name='Loads', index=False)
        voltage_levels.to_excel(writer, sheet_name='Voltage Levels', index=False)
    
    print(f"✅ Created: {output_path}")
    print(f"   Substations: {len(substations)}")
    print(f"   Buses: {len(buses)}")
    print(f"   Lines: {len(lines)}")
    print(f"   Transformers: {len(transformers)}")
    print(f"   Generators: {len(generators)}")
    print(f"   Loads: {len(loads)}")
    print(f"   Voltage Levels: {len(voltage_levels)}")
    
    total = len(substations) + len(buses) + len(lines) + len(transformers) + len(generators) + len(loads) + len(voltage_levels)
    print(f"\n   Total entities: {total}")

if __name__ == "__main__":
    create_excel()
