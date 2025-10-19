"""
Load Testing Utilities

Utilities for performance testing and load generation for ML services.
"""

import asyncio
import time
import json
import statistics
from typing import List, Dict, Any, Optional, Callable
from dataclasses import dataclass
from datetime import datetim