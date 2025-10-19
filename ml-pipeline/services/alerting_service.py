"""
Alerting Service

This service provides automated alerting capabilities for ML system monitoring,
including threshold-based alerts, anomaly detection, and notification management.
"""

import asyncio
import logging
import time
import json
from typing import Dict, List, Optional, Any, Callable
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
from enum import Enum
import aiohttp
import smtplib
from email.mime.text import MimeText
from email.mime.multipart import MimeMultipart

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AlertSeverity(Enum):
    """Alert severity levels"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class AlertStatus(Enum):
    """Alert status"""
    ACTIVE = "active"
    RESOLVED = "resolved"
    ACKNOWLEDGED = "acknowledged"
    SUPPRESSED = "suppressed"

@dataclass
class AlertRule:
    """Alert rule configuration"""
    id: str
    name: str
    description: str
    metric_name: str
    condition: str  # e.g., "gt", "lt", "eq", "ne"
    threshold: float
    severity: AlertSeverity
    duration_seconds: int = 300  # Alert fires after condition is true for this duration
    labels: Dict[str, str] = None
    annotations: Dict[str, str] = None
    enabled: bool = True
    
    def __post_init__(self):
        if self.labels is None:
            self.labels = {}
        if self.annotations is None:
            self.annotations = {}

@dataclass
class Alert:
    """Active alert instance"""
    id: str
    rule_id: str
    name: str
    description: str
    severity: AlertSeverity
    status: AlertStatus
    metric_name: str
    current_value: float
    threshold: float
    labels: Dict[str, str]
    annotations: Dict[str, str]
    started_at: datetime
    resolved_at: O