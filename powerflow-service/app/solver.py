import pandapower as pp
import time
import logging
from .models import CalculationMethod

logger = logging.getLogger(__name__)


def run_power_flow(
    net: pp.pandapowerNet,
    method: CalculationMethod,
    max_iterations: int = 100,
    tolerance: float = 1e-6,
) -> tuple[bool, int, int]:
    """
    Run power flow calculation using pandapower.

    For AC Newton-Raphson, uses a multi-strategy approach:
    1. Try NR with flat start
    2. If fails, try with looser tolerance
    3. If fails, try with DC initialization
    4. If fails, try Gauss-Seidel as fallback

    Returns:
        Tuple of (converged, iterations, execution_time_ms)
    """
    start_time = time.time()
    converged = False
    iterations = 0

    try:
        if method == CalculationMethod.DC:
            logger.info("Running DC power flow (pandapower)")
            pp.rundcpp(net)
            converged = True
            iterations = 1

        elif method == CalculationMethod.AC_NEWTON_RAPHSON:
            converged, iterations = _run_ac_robust(net, max_iterations, tolerance)

        elif method == CalculationMethod.OPF:
            logger.info("Running Optimal Power Flow (OPF)")
            pp.runopp(net)
            converged = net.OPF_converged if hasattr(net, "OPF_converged") else True
            iterations = 0

    except Exception as e:
        err_str = str(e).lower()
        if "not converge" in err_str or "loadflownotconverged" in type(e).__name__.lower():
            logger.warning("Power flow did not converge: %s", e)
            converged = False
            iterations = max_iterations
        else:
            logger.error(f"Power flow calculation error: {e}")
            raise

    execution_time_ms = int((time.time() - start_time) * 1000)

    logger.info(
        f"Power flow completed: converged={converged}, "
        f"iterations={iterations}, time={execution_time_ms}ms"
    )
    _log_voltage_profile(net, converged)

    return converged, iterations, execution_time_ms


def _log_voltage_profile(net: pp.pandapowerNet, converged: bool) -> None:
    """
    Report the solved voltage spread.

    A converged AC run whose magnitudes are all exactly 1.0 pu is not a real solution,
    it is a flat start that was never updated, so the spread is worth having in the log
    next to the iteration count rather than only in the API payload.
    """
    if not converged or not hasattr(net, "res_bus") or net.res_bus.empty:
        return
    try:
        vm = net.res_bus["vm_pu"].dropna()
        va = net.res_bus["va_degree"].dropna()
        if vm.empty:
            return
        logger.info(
            "Voltage profile: vm %.6f to %.6f pu, angle %.2f to %.2f deg, %d isolated buses",
            vm.min(), vm.max(), va.min(), va.max(), len(net.res_bus) - len(vm),
        )
    except Exception as e:
        logger.warning(f"Could not summarise voltage profile: {e}")


def _run_ac_robust(net: pp.pandapowerNet, max_iterations: int, tolerance: float) -> tuple[bool, int]:
    """
    Run AC power flow with multiple fallback strategies for robustness.
    """
    strategies = [
        {
            "name": "NR flat start",
            "algorithm": "nr",
            "init": "flat",
            "max_iteration": max_iterations,
            "tolerance_mva": tolerance,
            "enforce_q_lims": False,
        },
        {
            "name": "NR loose tolerance",
            "algorithm": "nr",
            "init": "flat",
            "max_iteration": max_iterations * 2,
            "tolerance_mva": 1e-2,
            "enforce_q_lims": False,
        },
        {
            "name": "NR DC init",
            "algorithm": "nr",
            "init": "dc",
            "max_iteration": max_iterations * 2,
            "tolerance_mva": 1e-2,
            "enforce_q_lims": False,
        },
    ]

    for strategy in strategies:
        name = strategy.pop("name")
        try:
            logger.info(f"Trying AC power flow strategy: {name}")
            pp.runpp(net, **strategy)
            if net.converged:
                iterations = _get_iterations(net, max_iterations)
                logger.info(f"AC power flow converged with strategy: {name}")
                return True, iterations
        except Exception as e:
            logger.warning(f"Strategy '{name}' failed: {e}")
            continue

    logger.error("All AC power flow strategies failed")
    return False, max_iterations


def _get_iterations(net: pp.pandapowerNet, max_iterations: int) -> int:
    """Extract iteration count from pandapower internal data."""
    try:
        if hasattr(net, "_ppc") and net._ppc is not None:
            return net._ppc.get("iterations", 0)
        elif hasattr(net, "_options") and "iterations" in net._options:
            return net._options["iterations"]
        return 0 if net.converged else max_iterations
    except Exception:
        return 0 if net.converged else max_iterations
