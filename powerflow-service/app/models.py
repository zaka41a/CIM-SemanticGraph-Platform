from pydantic import BaseModel, Field
from typing import List, Optional
from enum import Enum


class BusType(str, Enum):
    SLACK = "SLACK"
    PV = "PV"
    PQ = "PQ"


class BranchType(str, Enum):
    LINE = "LINE"
    TRANSFORMER = "TRANSFORMER"


class CalculationMethod(str, Enum):
    DC = "DC"
    AC_NEWTON_RAPHSON = "AC_NEWTON_RAPHSON"
    OPF = "OPF"


# --- Request Models ---

class BusInput(BaseModel):
    id: str
    name: str
    index: int
    type: BusType
    baseVoltageKv: float = Field(alias="baseVoltageKv")
    voltageMagnitude: float = 1.0
    voltageAngle: float = 0.0
    generationMw: float = 0.0
    generationMvar: float = 0.0
    generationMinMvar: float = -9999.0
    generationMaxMvar: float = 9999.0
    loadMw: float = 0.0
    loadMvar: float = 0.0
    voltageMin: float = 0.95
    voltageMax: float = 1.05
    inService: bool = True

    model_config = {"populate_by_name": True}


class BranchInput(BaseModel):
    id: str
    name: str
    type: BranchType
    fromBusId: str = Field(alias="fromBusId")
    toBusId: str = Field(alias="toBusId")
    resistance: float = 0.01
    reactance: float = 0.1
    susceptance: float = 0.0
    turnsRatio: float = 1.0
    phaseShift: float = 0.0
    ratingMva: float = 100.0
    inService: bool = True

    model_config = {"populate_by_name": True}


class NetworkInput(BaseModel):
    networkId: str = Field(alias="networkId")
    name: str = "CIM Network"
    baseMva: float = Field(default=100.0, alias="baseMva")
    buses: List[BusInput] = []
    branches: List[BranchInput] = []

    model_config = {"populate_by_name": True}


class PowerFlowRequest(BaseModel):
    network: NetworkInput
    method: CalculationMethod = CalculationMethod.AC_NEWTON_RAPHSON
    maxIterations: int = Field(default=100, alias="maxIterations")
    tolerance: float = 1e-6

    model_config = {"populate_by_name": True}


# --- Response Models ---

class BusResult(BaseModel):
    busId: str
    busName: str
    busType: str
    voltageMagnitude: float
    voltageAngle: float
    voltageKv: float
    activePowerMw: float
    reactivePowerMvar: float
    generationMw: float
    generationMvar: float
    loadMw: float
    loadMvar: float
    withinLimits: bool
    voltagePercentage: float


class BranchResult(BaseModel):
    branchId: str
    branchName: str
    branchType: str
    fromBusId: str
    toBusId: str
    fromActivePowerMw: float
    fromReactivePowerMvar: float
    toActivePowerMw: float
    toReactivePowerMvar: float
    lossActivePowerMw: float
    lossReactivePowerMvar: float
    currentMagnitude: float
    loadingPercentage: float
    overloaded: bool


class SystemStatistics(BaseModel):
    totalBuses: int
    totalBranches: int
    pvBuses: int
    pqBuses: int
    slackBuses: int
    totalGenerationMw: float
    totalGenerationMvar: float
    totalLoadMw: float
    totalLoadMvar: float
    totalLossesMw: float
    totalLossesMvar: float
    lossPercentage: float
    minVoltagePu: float
    maxVoltagePu: float
    avgVoltagePu: float
    minVoltageBus: str
    maxVoltageBus: str


class Violation(BaseModel):
    type: str
    severity: str
    elementId: str
    elementName: str
    actualValue: float = 0.0
    limitValue: float = 0.0
    violationPercentage: float = 0.0
    description: str


class PowerFlowResponse(BaseModel):
    converged: bool
    iterations: int
    tolerance: float
    executionTimeMs: int
    calculationMethod: str
    busResults: List[BusResult]
    branchResults: List[BranchResult]
    statistics: SystemStatistics
    violations: List[Violation]
    targetBusId: Optional[str] = None
    networkId: str


# --- Semantic Bus Search Models ---

class BusSearchRequest(BaseModel):
    question: str = Field(..., description="Natural language query, e.g. 'voltage at Berlin 380kV'")


class BusSearchResponse(BaseModel):
    found: bool
    busId: Optional[str] = None
    label: Optional[str] = None
    cimType: Optional[str] = None
    uri: Optional[str] = None
    score: Optional[float] = None
    method: Optional[str] = None   # "semantic"
    question: str
    message: str
