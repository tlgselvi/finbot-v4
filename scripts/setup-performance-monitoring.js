#!/usr/bin/env node

/**
 * FinBot v4 - Performance Monitoring Setup
 * Sets up comprehensive performance monitoring infrastructure
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const chalk = require('chalk');

// Configuration
const CONFIG = {
  // Monitoring stack components
  components: {
    prometheus: {
      enabled: true,
      port: 9090,
      configFile: 'monitoring/prometheus/prometheus.yml',
    },
    grafana: {
      enabled: true,
      port: 3001,
      dashboardsDir: 'monitoring/grafana/dashboards',
    },
    alertmanager: {
      enabled: true,
      port: 9093,
      configFile: 'monitoring/alertmanager/alertmanager.yml',
    },
    lighthouse: {
      enabled: true,
      schedule: '0 */6 * * *', // Every 6 hours
    },
    bundleAnalyzer: {
      enabled: true,
      schedule: 'on_build',
    }
  },
  
  // Directories to create
  directories: [
    'monitoring/prometheus',
    'monitoring/grafana/dashboards',
    'monitoring/grafana/provisioning/dashboards',
    'monitoring/grafana/provisioning/datasources',
    'monitoring/alertmanager',
    'monitoring/logs',
    'monitoring/data',
  ],
  
  // Docker compose services
  dockerServices: {
    prometheus: 'monitoring/docker-compose.monitoring.yml',
    grafana: 'monitoring/docker-compose.monitoring.yml',
    alertmanager: 'monitoring/docker-compose.monitoring.yml',
  }
};

class PerformanceMonitoringSetup {
  constructor() {
    this.ensureDirectories();
  }
  
  ensureDirectories() {
    CONFIG.directories.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(chalk.green(`✅ Created directory: ${dir}`));
      }
    });
  }
  
  setupPrometheus() {
    console.log(chalk.blue('🔧 Setting up Prometheus...'));
    
    const prometheusConfig = `
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "rules/*.yml"

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093

scrape_configs:
  # FinBot Application Metrics
  - job_name: 'finbot-app'
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: '/metrics'
    scrape_interval: 10s
    scrape_timeout: 5s

  # Node.js Application Metrics
  - job_name: 'finbot-node-metrics'
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: '/api/metrics'
    scrape_interval: 15s

  # Database Metrics (if PostgreSQL exporter is running)
  - job_name: 'postgres'
    static_configs:
      - targets: ['localhost:9187']
    scrape_interval: 30s

  # Redis Metrics (if Redis exporter is running)
  - job_name: 'redis'
    static_configs:
      - targets: ['localhost:9121']
    scrape_interval: 30s

  # System Metrics (if Node exporter is running)
  - job_name: 'node-exporter'
    static_configs:
      - targets: ['localhost:9100']
    scrape_interval: 30s

  # Custom Performance Metrics
  - job_name: 'performance-metrics'
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: '/api/performance/metrics'
    scrape_interval: 60s

  # Lighthouse Metrics (custom endpoint)
  - job_name: 'lighthouse-metrics'
    static_configs:
      - targets: ['localhost:3001']
    metrics_path: '/api/lighthouse/metrics'
    scrape_interval: 300s # Every 5 minutes
`;

    fs.writeFileSync(CONFIG.components.prometheus.configFile, prometheusConfig.trim());
    console.log(chalk.green('✅ Prometheus configuration created'));
  }
  
  setupGrafana() {
    console.log(chalk.blue('🔧 Setting up Grafana...'));
    
    // Datasource configuration
    const datasourceConfig = `
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: true
`;

    fs.writeFileSync('monitoring/grafana/provisioning/datasources/prometheus.yml', datasourceConfig.trim());
    
    // Dashboard provisioning
    const dashboardProvisioning = `
apiVersion: 1

providers:
  - name: 'default'
    orgId: 1
    folder: ''
    type: file
    disableDeletion: false
    updateIntervalSeconds: 10
    allowUiUpdates: true
    options:
      path: /etc/grafana/provisioning/dashboards
`;

    fs.writeFileSync('monitoring/grafana/provisioning/dashboards/dashboard.yml', dashboardProvisioning.trim());
    
    // Performance dashboard
    this.createPerformanceDashboard();
    
    console.log(chalk.green('✅ Grafana configuration created'));
  }
  
  createPerformanceDashboard() {
    const dashboard = {
      "dashboard": {
        "id": null,
        "title": "FinBot v4 Performance Dashboard",
        "tags": ["finbot", "performance"],
        "timezone": "browser",
        "panels": [
          {
            "id": 1,
            "title": "Core Web Vitals",
            "type": "stat",
            "targets": [
              {
                "expr": "lighthouse_first_contentful_paint",
                "legendFormat": "First Contentful Paint (ms)"
              },
              {
                "expr": "lighthouse_largest_contentful_paint",
                "legendFormat": "Largest Contentful Paint (ms)"
              },
              {
                "expr": "lighthouse_cumulative_layout_shift",
                "legendFormat": "Cumulative Layout Shift"
              }
            ],
            "fieldConfig": {
              "defaults": {
                "thresholds": {
                  "steps": [
                    {"color": "green", "value": null},
                    {"color": "yellow", "value": 2000},
                    {"color": "red", "value": 4000}
                  ]
                }
              }
            },
            "gridPos": {"h": 8, "w": 12, "x": 0, "y": 0}
          },
          {
            "id": 2,
            "title": "API Response Times",
            "type": "graph",
            "targets": [
              {
                "expr": "api_response_time_p50",
                "legendFormat": "P50"
              },
              {
                "expr": "api_response_time_p95",
                "legendFormat": "P95"
              },
              {
                "expr": "api_response_time_p99",
                "legendFormat": "P99"
              }
            ],
            "yAxes": [
              {
                "label": "Response Time (ms)",
                "min": 0
              }
            ],
            "gridPos": {"h": 8, "w": 12, "x": 12, "y": 0}
          },
          {
            "id": 3,
            "title": "Bundle Size Trends",
            "type": "graph",
            "targets": [
              {
                "expr": "bundle_size_total_kb",
                "legendFormat": "Total Bundle Size (KB)"
              },
              {
                "expr": "bundle_size_script_kb",
                "legendFormat": "Script Size (KB)"
              },
              {
                "expr": "bundle_size_style_kb",
                "legendFormat": "Style Size (KB)"
              }
            ],
            "yAxes": [
              {
                "label": "Size (KB)",
                "min": 0
              }
            ],
            "gridPos": {"h": 8, "w": 12, "x": 0, "y": 8}
          },
          {
            "id": 4,
            "title": "System Resources",
            "type": "graph",
            "targets": [
              {
                "expr": "process_memory_usage_mb",
                "legendFormat": "Memory Usage (MB)"
              },
              {
                "expr": "process_cpu_usage_percent",
                "legendFormat": "CPU Usage (%)"
              }
            ],
            "gridPos": {"h": 8, "w": 12, "x": 12, "y": 8}
          },
          {
            "id": 5,
            "title": "Error Rates",
            "type": "singlestat",
            "targets": [
              {
                "expr": "api_error_rate",
                "legendFormat": "API Error Rate"
              }
            ],
            "thresholds": "0.01,0.05",
            "colorBackground": true,
            "gridPos": {"h": 4, "w": 6, "x": 0, "y": 16}
          },
          {
            "id": 6,
            "title": "Throughput",
            "type": "singlestat",
            "targets": [
              {
                "expr": "api_requests_per_second",
                "legendFormat": "Requests/sec"
              }
            ],
            "gridPos": {"h": 4, "w": 6, "x": 6, "y": 16}
          }
        ],
        "time": {
          "from": "now-1h",
          "to": "now"
        },
        "refresh": "30s"
      }
    };
    
    fs.writeFileSync(
      'monitoring/grafana/dashboards/performance-dashboard.json',
      JSON.stringify(dashboard, null, 2)
    );
  }
  
  setupAlertManager() {
    console.log(chalk.blue('🔧 Setting up AlertManager...'));
    
    const alertManagerConfig = `
global:
  smtp_smarthost: 'localhost:587'
  smtp_from: 'alerts@finbot.com'

route:
  group_by: ['alertname']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 1h
  receiver: 'web.hook'
  routes:
    - match:
        severity: critical
      receiver: 'critical-alerts'
    - match:
        severity: warning
      receiver: 'warning-alerts'

receivers:
  - name: 'web.hook'
    webhook_configs:
      - url: 'http://localhost:3001/api/alerts/webhook'

  - name: 'critical-alerts'
    slack_configs:
      - api_url: '\${SLACK_WEBHOOK_URL}'
        channel: '#critical-alerts'
        title: '🚨 Critical Performance Alert'
        text: '{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'
    email_configs:
      - to: 'dev-team@finbot.com'
        subject: '🚨 Critical Performance Alert'
        body: |
          {{ range .Alerts }}
          Alert: {{ .Annotations.summary }}
          Description: {{ .Annotations.description }}
          {{ end }}

  - name: 'warning-alerts'
    slack_configs:
      - api_url: '\${SLACK_WEBHOOK_URL}'
        channel: '#performance-alerts'
        title: '⚠️ Performance Warning'
        text: '{{ range .Alerts }}{{ .Annotations.summary }}{{ end }}'

inhibit_rules:
  - source_match:
      severity: 'critical'
    target_match:
      severity: 'warning'
    equal: ['alertname', 'instance']
`;

    fs.writeFileSync('monitoring/alertmanager/alertmanager.yml', alertManagerConfig.trim());
    console.log(chalk.green('✅ AlertManager configuration created'));
  }
  
  setupDockerCompose() {
    console.log(chalk.blue('🔧 Setting up Docker Compose for monitoring...'));
    
    const dockerCompose = `
version: '3.8'

services:
  prometheus:
    image: prom/prometheus:latest
    container_name: finbot-prometheus
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - ./prometheus/rules:/etc/prometheus/rules
      - prometheus-data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
      - '--web.console.libraries=/etc/prometheus/console_libraries'
      - '--web.console.templates=/etc/prometheus/consoles'
      - '--storage.tsdb.retention.time=200h'
      - '--web.enable-lifecycle'
      - '--web.enable-admin-api'
    networks:
      - monitoring

  grafana:
    image: grafana/grafana:latest
    container_name: finbot-grafana
    ports:
      - "3001:3000"
    volumes:
      - grafana-data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning
      - ./grafana/dashboards:/etc/grafana/provisioning/dashboards
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
      - GF_USERS_ALLOW_SIGN_UP=false
    networks:
      - monitoring

  alertmanager:
    image: prom/alertmanager:latest
    container_name: finbot-alertmanager
    ports:
      - "9093:9093"
    volumes:
      - ./alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml
      - alertmanager-data:/alertmanager
    command:
      - '--config.file=/etc/alertmanager/alertmanager.yml'
      - '--storage.path=/alertmanager'
      - '--web.external-url=http://localhost:9093'
    networks:
      - monitoring

  node-exporter:
    image: prom/node-exporter:latest
    container_name: finbot-node-exporter
    ports:
      - "9100:9100"
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - '--path.procfs=/host/proc'
      - '--path.rootfs=/rootfs'
      - '--path.sysfs=/host/sys'
      - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'
    networks:
      - monitoring

  postgres-exporter:
    image: prometheuscommunity/postgres-exporter:latest
    container_name: finbot-postgres-exporter
    ports:
      - "9187:9187"
    environment:
      - DATA_SOURCE_NAME=postgresql://postgres:password@postgres:5432/finbot_v4?sslmode=disable
    networks:
      - monitoring
    depends_on:
      - postgres

  redis-exporter:
    image: oliver006/redis_exporter:latest
    container_name: finbot-redis-exporter
    ports:
      - "9121:9121"
    environment:
      - REDIS_ADDR=redis://redis:6379
    networks:
      - monitoring
    depends_on:
      - redis

networks:
  monitoring:
    driver: bridge

volumes:
  prometheus-data:
  grafana-data:
  alertmanager-data:
`;

    fs.writeFileSync('monitoring/docker-compose.monitoring.yml', dockerCompose.trim());
    console.log(chalk.green('✅ Docker Compose configuration created'));
  }
  
  setupCronJobs() {
    console.log(chalk.blue('🔧 Setting up scheduled performance monitoring...'));
    
    const cronScript = `#!/bin/bash

# FinBot v4 Performance Monitoring Cron Jobs

# Run Lighthouse audit every 6 hours
0 */6 * * * cd /path/to/finbot && node scripts/performance-budget-monitor.js >> /var/log/finbot-performance.log 2>&1

# Run bundle size analysis on every build (triggered by CI/CD)
# This is handled by the CI/CD pipeline

# Run load testing daily at 2 AM
0 2 * * * cd /path/to/finbot && node scripts/run-performance-tests.js --test=k6 >> /var/log/finbot-load-test.log 2>&1

# Run performance regression test weekly on Sundays at 3 AM
0 3 * * 0 cd /path/to/finbot && node tests/performance/regression-test.js --update-baseline >> /var/log/finbot-regression.log 2>&1

# Clean up old performance reports monthly
0 0 1 * * find /path/to/finbot/tests/performance/results -name "*.json" -mtime +30 -delete
0 0 1 * * find /path/to/finbot/tests/performance/reports -name "*.json" -mtime +30 -delete
`;

    fs.writeFileSync('scripts/performance-monitoring-cron.sh', cronScript.trim());
    fs.chmodSync('scripts/performance-monitoring-cron.sh', '755');
    console.log(chalk.green('✅ Cron jobs script created'));
  }
  
  setupSystemdServices() {
    console.log(chalk.blue('🔧 Setting up systemd services...'));
    
    const performanceMonitorService = `
[Unit]
Description=FinBot Performance Monitor
After=network.target

[Service]
Type=simple
User=finbot
WorkingDirectory=/path/to/finbot
ExecStart=/usr/bin/node scripts/performance-budget-monitor.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
`;

    fs.writeFileSync('monitoring/systemd/finbot-performance-monitor.service', performanceMonitorService.trim());
    console.log(chalk.green('✅ Systemd service files created'));
  }
  
  createStartupScript() {
    console.log(chalk.blue('🔧 Creating monitoring startup script...'));
    
    const startupScript = `#!/bin/bash

# FinBot v4 Performance Monitoring Startup Script

set -e

echo "🚀 Starting FinBot Performance Monitoring Stack..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Start monitoring stack
echo "📊 Starting Prometheus, Grafana, and AlertManager..."
docker-compose -f monitoring/docker-compose.monitoring.yml up -d

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 30

# Check service health
echo "🔍 Checking service health..."

# Check Prometheus
if curl -f http://localhost:9090/-/healthy > /dev/null 2>&1; then
    echo "✅ Prometheus is healthy"
else
    echo "❌ Prometheus health check failed"
fi

# Check Grafana
if curl -f http://localhost:3001/api/health > /dev/null 2>&1; then
    echo "✅ Grafana is healthy"
else
    echo "❌ Grafana health check failed"
fi

# Check AlertManager
if curl -f http://localhost:9093/-/healthy > /dev/null 2>&1; then
    echo "✅ AlertManager is healthy"
else
    echo "❌ AlertManager health check failed"
fi

echo ""
echo "🎉 Performance monitoring stack is ready!"
echo ""
echo "📊 Access URLs:"
echo "   Prometheus: http://localhost:9090"
echo "   Grafana:    http://localhost:3001 (admin/admin)"
echo "   AlertManager: http://localhost:9093"
echo ""
echo "📈 To run performance tests:"
echo "   npm run perf:test"
echo "   npm run perf:budget"
echo ""
`;

    fs.writeFileSync('scripts/start-monitoring.sh', startupScript.trim());
    fs.chmodSync('scripts/start-monitoring.sh', '755');
    console.log(chalk.green('✅ Monitoring startup script created'));
  }
  
  updatePackageJson() {
    console.log(chalk.blue('🔧 Updating package.json with monitoring scripts...'));
    
    const packageJsonPath = 'finbotv3/QuickServeAPI/package.json';
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      
      // Add monitoring scripts
      packageJson.scripts = {
        ...packageJson.scripts,
        'monitor:start': 'bash ../scripts/start-monitoring.sh',
        'monitor:stop': 'docker-compose -f ../monitoring/docker-compose.monitoring.yml down',
        'monitor:budget': 'node ../scripts/performance-budget-monitor.js',
        'monitor:setup': 'node ../scripts/setup-performance-monitoring.js',
      };
      
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
      console.log(chalk.green('✅ Package.json updated with monitoring scripts'));
    }
  }
  
  run() {
    try {
      console.log(chalk.bold('🚀 Setting up FinBot v4 Performance Monitoring...\n'));
      
      this.setupPrometheus();
      this.setupGrafana();
      this.setupAlertManager();
      this.setupDockerCompose();
      this.setupCronJobs();
      this.setupSystemdServices();
      this.createStartupScript();
      this.updatePackageJson();
      
      console.log(chalk.bold.green('\n🎉 Performance monitoring setup completed successfully!'));
      console.log(chalk.blue('\n📋 Next steps:'));
      console.log('  1. Start the monitoring stack: npm run monitor:start');
      console.log('  2. Configure Slack webhook URL in environment variables');
      console.log('  3. Set up cron jobs: crontab scripts/performance-monitoring-cron.sh');
      console.log('  4. Run initial performance budget check: npm run monitor:budget');
      console.log('\n📊 Access URLs:');
      console.log('  • Prometheus: http://localhost:9090');
      console.log('  • Grafana: http://localhost:3001 (admin/admin)');
      console.log('  • AlertManager: http://localhost:9093');
      
    } catch (error) {
      console.error(chalk.red('❌ Performance monitoring setup failed:'), error.message);
      process.exit(1);
    }
  }
}

// CLI interface
if (require.main === module) {
  const setup = new PerformanceMonitoringSetup();
  setup.run();
}

module.exports = PerformanceMonitoringSetup;