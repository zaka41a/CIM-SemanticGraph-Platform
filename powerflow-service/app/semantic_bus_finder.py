"""
SemanticBusFinder — finds the best matching CIM bus for a natural language query.

Flow:
  question → OpenAI embedding → Qdrant search (filtered by bus CIM types)
           → BusMatch (id, label, type, score)

Falls back gracefully if Qdrant or OpenAI is not available.
"""

import os
import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)

# CIM types that represent electrical buses
BUS_CIM_TYPES = [
    "BusbarSection",
    "TopologicalNode",
    "ConnectivityNode",
]

SCORE_THRESHOLD = 0.30
EMBEDDING_MODEL  = "text-embedding-3-small"


@dataclass
class BusMatch:
    bus_id:   str    # local name usable as bus ID in load flow
    label:    str    # human-readable name from CIM
    cim_type: str    # BusbarSection | TopologicalNode | ConnectivityNode
    uri:      str    # full CIM URI
    score:    float  # cosine similarity (0.0 – 1.0)
    method:   str    # "semantic"


class SemanticBusFinder:
    """
    Lazy-initialised singleton that wraps Qdrant + OpenAI calls.
    If either service is unavailable, every call returns None silently.
    """

    def __init__(self) -> None:
        self._qdrant_url      = os.getenv("QDRANT_URL",        "http://localhost:6333")
        self._openai_api_key  = os.getenv("OPENAI_API_KEY",    "")
        self._collection_name = os.getenv("QDRANT_COLLECTION", "cim_entities")
        self._qdrant  = None
        self._openai  = None
        self._ready   = False
        self._tried   = False   # avoid retrying after a failed init

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def find_bus(self, question: str, top_k: int = 1) -> Optional[BusMatch]:
        """
        Return the best matching CIM bus for *question*, or None.

        Args:
            question: Natural language query, e.g. "voltage at Berlin 380 kV"
            top_k:    Number of candidates to retrieve from Qdrant (we return only #1)
        """
        if not question or not question.strip():
            return None

        if not self._setup():
            return None

        return self._semantic_search(question, top_k)

    def is_available(self) -> bool:
        """True if both Qdrant and OpenAI are reachable."""
        self._setup()
        return self._ready

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _setup(self) -> bool:
        """Lazy init — called once. Returns True if ready."""
        if self._ready:
            return True
        if self._tried:
            return False

        self._tried = True

        try:
            from qdrant_client import QdrantClient
            client = QdrantClient(url=self._qdrant_url, timeout=5)
            # Verify collection exists
            collections = [c.name for c in client.get_collections().collections]
            if self._collection_name not in collections:
                logger.warning(
                    "Qdrant collection '%s' not found — run a CIM import first.",
                    self._collection_name,
                )
                return False
            self._qdrant = client

        except Exception as exc:
            logger.warning("Qdrant not available at %s: %s", self._qdrant_url, exc)
            return False

        if not self._openai_api_key:
            logger.warning(
                "OPENAI_API_KEY not set — semantic bus search disabled."
            )
            return False

        try:
            from openai import OpenAI
            self._openai = OpenAI(api_key=self._openai_api_key)
        except Exception as exc:
            logger.warning("OpenAI client init failed: %s", exc)
            return False

        self._ready = True
        logger.info(
            "SemanticBusFinder ready. Qdrant=%s, collection=%s",
            self._qdrant_url,
            self._collection_name,
        )
        return True

    def _semantic_search(self, question: str, top_k: int) -> Optional[BusMatch]:
        """Encode question → search Qdrant filtered by bus CIM types."""
        try:
            # 1. Generate embedding
            response = self._openai.embeddings.create(
                input=question,
                model=EMBEDDING_MODEL,
            )
            query_vector = response.data[0].embedding

            # 2. Build Qdrant filter — bus types only
            from qdrant_client.models import Filter, FieldCondition, MatchAny
            bus_filter = Filter(
                should=[
                    FieldCondition(
                        key="type",
                        match=MatchAny(any=BUS_CIM_TYPES),
                    )
                ]
            )

            # 3. Search
            hits = self._qdrant.search(
                collection_name=self._collection_name,
                query_vector=query_vector,
                query_filter=bus_filter,
                limit=top_k,
                score_threshold=SCORE_THRESHOLD,
                with_payload=True,
            )

            if not hits:
                logger.info(
                    "No bus found in Qdrant for query '%s' (threshold=%.2f)",
                    question[:80],
                    SCORE_THRESHOLD,
                )
                return None

            top     = hits[0]
            payload = top.payload or {}
            uri     = payload.get("uri",   "")
            label   = payload.get("label", "")
            cim_type = payload.get("type", "")
            bus_id  = _extract_local_name(uri) or label

            logger.info(
                "Semantic bus match: '%s' (type=%s, score=%.3f)",
                bus_id, cim_type, top.score,
            )

            return BusMatch(
                bus_id=bus_id,
                label=label,
                cim_type=cim_type,
                uri=uri,
                score=top.score,
                method="semantic",
            )

        except Exception as exc:
            logger.warning("Semantic bus search error: %s", exc)
            return None


# ------------------------------------------------------------------
# Module-level singleton + convenience function
# ------------------------------------------------------------------

_finder = SemanticBusFinder()


def find_bus(question: str) -> Optional[BusMatch]:
    """Find the best matching CIM bus for a natural language question."""
    return _finder.find_bus(question)


def is_available() -> bool:
    """True if Qdrant + OpenAI are configured and reachable."""
    return _finder.is_available()


# ------------------------------------------------------------------
# Utility
# ------------------------------------------------------------------

def _extract_local_name(uri: str) -> str:
    """Extract local name from a URI (after # or last /)."""
    if not uri:
        return ""
    sep = max(uri.rfind("#"), uri.rfind("/"))
    return uri[sep + 1:] if 0 <= sep < len(uri) - 1 else uri
