/**
 * Comprehensive Monitoring Dashboard
 * 
 * React component for monitoring ML system performance, alerts,
 * and business metrics with real-time updates and alerting.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Progress,
  Badge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Alert,
  AlertDescription,
  AlertTitle