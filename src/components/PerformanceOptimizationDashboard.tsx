/**
 * Performance Optimization Dashboard
 * 
 * React component for monitoring and managing ML model performance optimization,
 * including model quantization, pruning, GPU acceleration, and caching metrics.
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
  AlertTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Cpu,
  Zap,
  Database,
  TrendingUp,
  TrendingDown,
  Activity,
  Settings,
  Play,
  Pause,
  RefreshCw,
  AlertTriangle,
  CheckCircle,
  Clock,
  MemoryStick,
  HardDrive,
} from 'lucide-react';

// Types
interface ModelOptimization {
  id: string;
  modelName: string;
  optimizationType: 'quantization' | 'pruning' | 'onnx_conversion' | 'tensorflow_lite';
  originalSizeMb: number;
  optimizedSizeMb: number;
  sizeReductionPercent: number;
  status: 'completed' | 'in_progress' | 'failed';
  createdAt: string;
  performance?: {
    avgLatencyMs: number;
    throughputPredPerSec: number;
  };
}

interface GPUInfo {
  deviceId: number;
  name: string;
  memoryUtilizationPercent: number;
  memoryAllocatedMb: number;
  memoryTotalMb: number;
  temperature?: number;
}

interface SystemMetrics {
  cpu: {
    utilizationPercent: number;
    memoryPercent: number;
  };
  gpu?: GPUInfo[];
  timestamp: number;
}

interface CacheMetrics {
  hitRate: number;
  missRate: number;
  totalRequests: number;
  cacheSize: number;
  evictions: number;
}

interface PerformanceMetrics {
  avgLatency: number;
  p95Latency: number;
  throughput: number;
  errorRate: number;
  timestamp: number;
}

const PerformanceOptimizationDashboard: React.FC = () => {
  // State
  const [optimizations, setOptimizations] = useState<ModelOptimization[]>([]);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics | null>(null);
  const [cacheMetrics, setCacheMetrics] = useState<CacheMetrics | null>(null);
  const [performanceHistory, setPerformanceHistory] = useState<PerformanceMetrics[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(5000);

  // Fetch data functions
  const fetchOptimizations = useCallback(async () => {
    try {
      const response = await fetch('/api/ml/optimizations');
      const data = await response.json();
      setOptimizations(data.optimizations || []);
    } catch (error) {
      console.error('Error fetching optimizations:', error);
    }
  }, []);

  const fetchSystemMetrics = useCallback(async () => {
    try {
      const response = await fetch('/api/ml/system-metrics');
      const data = await response.json();
      setSystemMetrics(data);
    } catch (error) {
      console.error('Error fetching system metrics:', error);
    }
  }, []);

  const fetchCacheMetrics = useCallback(async () => {
    try {
      const response = await fetch('/api/ml/cache-metrics');
      const data = await response.json();
      setCacheMetrics(data);
    } catch (error) {
      console.error('Error fetching cache metrics:', error);
    }
  }, []);

  const fetchPerformanceHistory = useCallback(async () => {
    try {
      const response = await fetch('/api/ml/performance-history?hours=24');
      const data = await response.json();
      setPerformanceHistory(data.metrics || []);
    } catch (error) {
      console.error('Error fetching performance history:', error);
    }
  }, []);

  const fetchAllData = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([
      fetchOptimizations(),
      fetchSystemMetrics(),
      fetchCacheMetrics(),
      fetchPerformanceHistory(),
    ]);
    setIsLoading(false);
  }, [fetchOptimizations, fetchSystemMetrics, fetchCacheMetrics, fetchPerformanceHistory]);

  // Effects
  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchAllData, refreshInterval);
    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, fetchAllData]);

  // Action handlers
  const handleOptimizeModel = async (modelName: string, optimizationType: string) => {
    try {
      const response = await fetch('/api/ml/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelName, optimizationType }),
      });
      
      if (response.ok) {
        await fetchOptimizations();
      }
    } catch (error) {
      console.error('Error optimizing model:', error);
    }
  };

  const handleClearCache = async () => {
    try {
      await fetch('/api/ml/cache/clear', { method: 'POST' });
      await fetchCacheMetrics();
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  };

  const handleClearGPUCache = async () => {
    try {
      await fetch('/api/ml/gpu/clear-cache', { method: 'POST' });
      await fetchSystemMetrics();
    } catch (error) {
      console.error('Error clearing GPU cache:', error);
    }
  };

  // Utility functions
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'completed': return 'text-green-600';
      case 'in_progress': return 'text-yellow-600';
      case 'failed': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4" />;
      case 'in_progress': return <Clock className="h-4 w-4" />;
      case 'failed': return <AlertTriangle className="h-4 w-4" />;
      default: return null;
    }
  };

  // Chart colors
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8'];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading performance metrics...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">ML Performance Optimization</h1>
          <p className="text-gray-600 mt-1">
            Monitor and optimize ML model performance, GPU utilization, and caching
          </p>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Switch
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
            />
            <span className="text-sm">Auto-refresh</span>
          </div>
          
          <Select value={refreshInterval.toString()} onValueChange={(value) => setRefreshInterval(Number(value))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1000">1s</SelectItem>
              <SelectItem value="5000">5s</SelectItem>
              <SelectItem value="10000">10s</SelectItem>
              <SelectItem value="30000">30s</SelectItem>
            </SelectContent>
          </Select>
          
          <Button onClick={fetchAllData} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* System Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
            <Cpu className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {systemMetrics?.cpu.utilizationPercent.toFixed(1)}%
            </div>
            <Progress value={systemMetrics?.cpu.utilizationPercent || 0} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Memory Usage</CardTitle>
            <MemoryStick className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {systemMetrics?.cpu.memoryPercent.toFixed(1)}%
            </div>
            <Progress value={systemMetrics?.cpu.memoryPercent || 0} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cache Hit Rate</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {cacheMetrics?.hitRate.toFixed(1)}%
            </div>
            <div className="text-xs text-muted-foreground">
              {cacheMetrics?.totalRequests} total requests
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Latency</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {performanceHistory[performanceHistory.length - 1]?.avgLatency.toFixed(1) || 0}ms
            </div>
            <div className="text-xs text-muted-foreground">
              P95: {performanceHistory[performanceHistory.length - 1]?.p95Latency.toFixed(1) || 0}ms
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="optimizations" className="space-y-4">
        <TabsList>
          <TabsTrigger value="optimizations">Model Optimizations</TabsTrigger>
          <TabsTrigger value="gpu">GPU Acceleration</TabsTrigger>
          <TabsTrigger value="performance">Performance Metrics</TabsTrigger>
          <TabsTrigger value="cache">Cache Management</TabsTrigger>
        </TabsList>

        {/* Model Optimizations Tab */}
        <TabsContent value="optimizations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Model Optimization Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Select value={selectedModel} onValueChange={setSelectedModel}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Models</SelectItem>
                      <SelectItem value="spending_predictor">Spending Predictor</SelectItem>
                      <SelectItem value="anomaly_detector">Anomaly Detector</SelectItem>
                      <SelectItem value="risk_assessor">Risk Assessor</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <div className="space-x-2">
                    <Button 
                      onClick={() => handleOptimizeModel(selectedModel, 'quantization')}
                      size="sm"
                    >
                      <Zap className="h-4 w-4 mr-2" />
                      Quantize
                    </Button>
                    <Button 
                      onClick={() => handleOptimizeModel(selectedModel, 'pruning')}
                      size="sm"
                      variant="outline"
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      Prune
                    </Button>
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Model</TableHead>
                      <TableHead>Optimization</TableHead>
                      <TableHead>Size Reduction</TableHead>
                      <TableHead>Performance</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {optimizations.map((opt) => (
                      <TableRow key={opt.id}>
                        <TableCell className="font-medium">{opt.modelName}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{opt.optimizationType}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <span>{opt.sizeReductionPercent.toFixed(1)}%</span>
                            <TrendingDown className="h-4 w-4 text-green-600" />
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatBytes(opt.originalSizeMb * 1024 * 1024)} → {formatBytes(opt.optimizedSizeMb * 1024 * 1024)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {opt.performance && (
                            <div>
                              <div>{opt.performance.avgLatencyMs.toFixed(1)}ms</div>
                              <div className="text-xs text-muted-foreground">
                                {opt.performance.throughputPredPerSec.toFixed(1)} pred/s
                              </div>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className={`flex items-center space-x-1 ${getStatusColor(opt.status)}`}>
                            {getStatusIcon(opt.status)}
                            <span className="capitalize">{opt.status}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {new Date(opt.createdAt).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* GPU Acceleration Tab */}
        <TabsContent value="gpu" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>GPU Utilization</CardTitle>
              </CardHeader>
              <CardContent>
                {systemMetrics?.gpu && systemMetrics.gpu.length > 0 ? (
                  <div className="space-y-4">
                    {systemMetrics.gpu.map((gpu) => (
                      <div key={gpu.deviceId} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{gpu.name}</span>
                          <Button onClick={handleClearGPUCache} size="sm" variant="outline">
                            Clear Cache
                          </Button>
                        </div>
                        <Progress value={gpu.memoryUtilizationPercent} />
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>{formatBytes(gpu.memoryAllocatedMb * 1024 * 1024)} used</span>
                          <span>{formatBytes(gpu.memoryTotalMb * 1024 * 1024)} total</span>
                        </div>
                        {gpu.temperature && (
                          <div className="text-sm">
                            Temperature: {gpu.temperature}°C
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>No GPU Detected</AlertTitle>
                    <AlertDescription>
                      No compatible GPU devices found. Models will run on CPU.
                    </AlertDescription>
                  </Alert>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Inference Queue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span>Queue Size</span>
                    <Badge variant="outline">0 / 1000</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Processing Status</span>
                    <Badge variant="outline" className="text-green-600">
                      <Play className="h-3 w-3 mr-1" />
                      Active
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Batch Size</span>
                    <span>32</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Performance Metrics Tab */}
        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Latency Trends</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={performanceHistory}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="timestamp" 
                      tickFormatter={(value) => new Date(value).toLocaleTimeString()}
                    />
                    <YAxis />
                    <Line 
                      type="monotone" 
                      dataKey="avgLatency" 
                      stroke="#8884d8" 
                      name="Avg Latency (ms)"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="p95Latency" 
                      stroke="#82ca9d" 
                      name="P95 Latency (ms)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Throughput & Error Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={performanceHistory}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="timestamp" 
                      tickFormatter={(value) => new Date(value).toLocaleTimeString()}
                    />
                    <YAxis />
                    <Area 
                      type="monotone" 
                      dataKey="throughput" 
                      stackId="1" 
                      stroke="#8884d8" 
                      fill="#8884d8"
                      name="Throughput (req/s)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Cache Management Tab */}
        <TabsContent value="cache" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Cache Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                {cacheMetrics && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-2xl font-bold text-green-600">
                          {cacheMetrics.hitRate.toFixed(1)}%
                        </div>
                        <div className="text-sm text-muted-foreground">Hit Rate</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-red-600">
                          {cacheMetrics.missRate.toFixed(1)}%
                        </div>
                        <div className="text-sm text-muted-foreground">Miss Rate</div>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Total Requests</span>
                        <span>{cacheMetrics.totalRequests.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Cache Size</span>
                        <span>{formatBytes(cacheMetrics.cacheSize)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Evictions</span>
                        <span>{cacheMetrics.evictions.toLocaleString()}</span>
                      </div>
                    </div>
                    
                    <Button onClick={handleClearCache} variant="outline" className="w-full">
                      <HardDrive className="h-4 w-4 mr-2" />
                      Clear Cache
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Cache Hit/Miss Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                {cacheMetrics && (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Hits', value: cacheMetrics.hitRate, fill: '#00C49F' },
                          { name: 'Misses', value: cacheMetrics.missRate, fill: '#FF8042' },
                        ]}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {[
                          { name: 'Hits', value: cacheMetrics.hitRate, fill: '#00C49F' },
                          { name: 'Misses', value: cacheMetrics.missRate, fill: '#FF8042' },
                        ].map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PerformanceOptimizationDashboard;