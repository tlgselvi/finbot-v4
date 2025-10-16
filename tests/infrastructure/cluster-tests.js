#!/usr/bin/env node

/**
 * FinBot v4 - Infrastructure Deployment Tests
 * Tests for Kubernetes cluster, networking, and Istio service mesh
 */

const { execSync } = require('child_process');
const chalk = require('chalk');

class InfrastructureTests {
  constructor() {
    this.testResults = [];
    this.kubectl = 'kubectl';
    this.istioctl = 'istioctl';
  }

  async runAllTests() {
    console.log(chalk.bold('🧪 Running Infrastructure Deployment Tests\n'));

    try {
      await this.testClusterConnectivity();
      await this.testNodeHealth();
      await this.testNamespaceIsolation();
      await this.testResourceQuotas();
      await this.testRBACPolicies();
      await this.testIstioInstallation();
      await this.testServiceMeshConfiguration();
      await this.testNetworkPolicies();
      await this.testAutoScaling();
      
      this.printResults();
      
      const failedTests = this.testResults.filter(r => !r.passed).length;
      if (failedTests > 0) {
        console.log(chalk.red(`\n❌ ${failedTests} tests failed`));
        process.exit(1);
      } else {
        console.log(chalk.green('\n✅ All infrastructure tests passed'));
        process.exit(0);
      }
    } catch (error) {
      console.error(chalk.red('❌ Infrastructure tests failed:'), error.message);
      process.exit(1);
    }
  }

  async testClusterConnectivity() {
    console.log(chalk.blue('🔗 Testing cluster connectivity...'));
    
    try {
      // Test kubectl connectivity
      const clusterInfo = execSync(`${this.kubectl} cluster-info`, { encoding: 'utf8' });
      this.addResult('Cluster Connectivity', true, 'Kubectl can connect to cluster');
      
      // Test API server health
      const apiHealth = execSync(`${this.kubectl} get --raw='/healthz'`, { encoding: 'utf8' });
      const isHealthy = apiHealth.trim() === 'ok';
      this.addResult('API Server Health', isHealthy, isHealthy ? 'API server is healthy' : 'API server unhealthy');
      
      // Test node readiness
      const nodes = execSync(`${this.kubectl} get nodes -o jsonpath='{.items[*].status.conditions[?(@.type=="Ready")].status}'`, { encoding: 'utf8' });
      const allNodesReady = nodes.split(' ').every(status => status === 'True');
      this.addResult('Node Readiness', allNodesReady, allNodesReady ? 'All nodes are ready' : 'Some nodes are not ready');
      
    } catch (error) {
      this.addResult('Cluster Connectivity', false, `Failed to connect: ${error.message}`);
    }
  }

  async testNodeHealth() {
    console.log(chalk.blue('🖥️  Testing node health...'));
    
    try {
      // Test node count
      const nodeCount = execSync(`${this.kubectl} get nodes --no-headers | wc -l`, { encoding: 'utf8' });
      const minNodes = 3;
      const hasMinNodes = parseInt(nodeCount.trim()) >= minNodes;
      this.addResult('Minimum Node Count', hasMinNodes, `Has ${nodeCount.trim()} nodes (minimum: ${minNodes})`);
      
      // Test node resources
      const nodeResources = execSync(`${this.kubectl} top nodes --no-headers`, { encoding: 'utf8' });
      const nodes = nodeResources.trim().split('\n');
      let allNodesHealthy = true;
      
      nodes.forEach(node => {
        const parts = node.split(/\s+/);
        const cpuUsage = parseInt(parts[1].replace('%', ''));
        const memUsage = parseInt(parts[3].replace('%', ''));
        
        if (cpuUsage > 90 || memUsage > 90) {
          allNodesHealthy = false;
        }
      });
      
      this.addResult('Node Resource Usage', allNodesHealthy, allNodesHealthy ? 'All nodes have healthy resource usage' : 'Some nodes have high resource usage');
      
      // Test cluster autoscaler
      const autoscalerPods = execSync(`${this.kubectl} get pods -n kube-system -l app=cluster-autoscaler --no-headers | wc -l`, { encoding: 'utf8' });
      const hasAutoscaler = parseInt(autoscalerPods.trim()) > 0;
      this.addResult('Cluster Autoscaler', hasAutoscaler, hasAutoscaler ? 'Cluster autoscaler is running' : 'Cluster autoscaler not found');
      
    } catch (error) {
      this.addResult('Node Health', false, `Failed to check node health: ${error.message}`);
    }
  }

  async testNamespaceIsolation() {
    console.log(chalk.blue('🏠 Testing namespace isolation...'));
    
    try {
      // Test required namespaces exist
      const requiredNamespaces = ['production', 'staging', 'monitoring', 'database', 'cache', 'security'];
      const existingNamespaces = execSync(`${this.kubectl} get namespaces -o jsonpath='{.items[*].metadata.name}'`, { encoding: 'utf8' });
      
      requiredNamespaces.forEach(ns => {
        const exists = existingNamespaces.includes(ns);
        this.addResult(`Namespace: ${ns}`, exists, exists ? `${ns} namespace exists` : `${ns} namespace missing`);
      });
      
      // Test namespace labels
      const productionLabels = execSync(`${this.kubectl} get namespace production -o jsonpath='{.metadata.labels}'`, { encoding: 'utf8' });
      const hasSecurityLabels = productionLabels.includes('pod-security.kubernetes.io/enforce');
      this.addResult('Namespace Security Labels', hasSecurityLabels, hasSecurityLabels ? 'Security labels configured' : 'Security labels missing');
      
    } catch (error) {
      this.addResult('Namespace Isolation', false, `Failed to test namespaces: ${error.message}`);
    }
  }

  async testResourceQuotas() {
    console.log(chalk.blue('📊 Testing resource quotas...'));
    
    try {
      // Test resource quotas exist
      const quotas = execSync(`${this.kubectl} get resourcequotas --all-namespaces --no-headers | wc -l`, { encoding: 'utf8' });
      const hasQuotas = parseInt(quotas.trim()) > 0;
      this.addResult('Resource Quotas', hasQuotas, hasQuotas ? `${quotas.trim()} resource quotas configured` : 'No resource quotas found');
      
      // Test limit ranges exist
      const limitRanges = execSync(`${this.kubectl} get limitranges --all-namespaces --no-headers | wc -l`, { encoding: 'utf8' });
      const hasLimitRanges = parseInt(limitRanges.trim()) > 0;
      this.addResult('Limit Ranges', hasLimitRanges, hasLimitRanges ? `${limitRanges.trim()} limit ranges configured` : 'No limit ranges found');
      
      // Test production quota enforcement
      const prodQuota = execSync(`${this.kubectl} get resourcequota production-quota -n production -o jsonpath='{.status.used}'`, { encoding: 'utf8' });
      const quotaConfigured = prodQuota.length > 0;
      this.addResult('Production Quota Enforcement', quotaConfigured, quotaConfigured ? 'Production quota is enforced' : 'Production quota not enforced');
      
    } catch (error) {
      this.addResult('Resource Quotas', false, `Failed to test resource quotas: ${error.message}`);
    }
  }

  async testRBACPolicies() {
    console.log(chalk.blue('🔐 Testing RBAC policies...'));
    
    try {
      // Test service accounts exist
      const serviceAccounts = ['finbot-production', 'finbot-staging', 'finbot-database', 'finbot-cache', 'finbot-monitoring'];
      
      for (const sa of serviceAccounts) {
        try {
          const namespace = sa.includes('production') ? 'production' : 
                           sa.includes('staging') ? 'staging' :
                           sa.includes('database') ? 'database' :
                           sa.includes('cache') ? 'cache' : 'monitoring';
          
          execSync(`${this.kubectl} get serviceaccount ${sa} -n ${namespace}`, { encoding: 'utf8' });
          this.addResult(`Service Account: ${sa}`, true, `${sa} exists in ${namespace}`);
        } catch (error) {
          this.addResult(`Service Account: ${sa}`, false, `${sa} not found`);
        }
      }
      
      // Test cluster roles exist
      const clusterRoles = execSync(`${this.kubectl} get clusterroles | grep finbot | wc -l`, { encoding: 'utf8' });
      const hasClusterRoles = parseInt(clusterRoles.trim()) > 0;
      this.addResult('Cluster Roles', hasClusterRoles, hasClusterRoles ? `${clusterRoles.trim()} FinBot cluster roles found` : 'No FinBot cluster roles found');
      
      // Test role bindings exist
      const roleBindings = execSync(`${this.kubectl} get rolebindings --all-namespaces | grep finbot | wc -l`, { encoding: 'utf8' });
      const hasRoleBindings = parseInt(roleBindings.trim()) > 0;
      this.addResult('Role Bindings', hasRoleBindings, hasRoleBindings ? `${roleBindings.trim()} FinBot role bindings found` : 'No FinBot role bindings found');
      
    } catch (error) {
      this.addResult('RBAC Policies', false, `Failed to test RBAC: ${error.message}`);
    }
  }

  async testIstioInstallation() {
    console.log(chalk.blue('🕸️  Testing Istio installation...'));
    
    try {
      // Test Istio system namespace
      execSync(`${this.kubectl} get namespace istio-system`, { encoding: 'utf8' });
      this.addResult('Istio System Namespace', true, 'istio-system namespace exists');
      
      // Test Istiod deployment
      const istiodPods = execSync(`${this.kubectl} get pods -n istio-system -l app=istiod --no-headers | wc -l`, { encoding: 'utf8' });
      const hasIstiod = parseInt(istiodPods.trim()) >= 3;
      this.addResult('Istiod High Availability', hasIstiod, hasIstiod ? `${istiodPods.trim()} Istiod replicas running` : 'Insufficient Istiod replicas');
      
      // Test ingress gateway
      const ingressPods = execSync(`${this.kubectl} get pods -n istio-system -l app=istio-ingressgateway --no-headers | wc -l`, { encoding: 'utf8' });
      const hasIngress = parseInt(ingressPods.trim()) >= 3;
      this.addResult('Ingress Gateway HA', hasIngress, hasIngress ? `${ingressPods.trim()} ingress gateway replicas` : 'Insufficient ingress gateway replicas');
      
      // Test Istio configuration
      const istioConfig = execSync(`${this.istioctl} proxy-config cluster -n istio-system deploy/istiod | wc -l`, { encoding: 'utf8' });
      const hasConfig = parseInt(istioConfig.trim()) > 0;
      this.addResult('Istio Configuration', hasConfig, hasConfig ? 'Istio configuration loaded' : 'Istio configuration missing');
      
    } catch (error) {
      this.addResult('Istio Installation', false, `Failed to test Istio: ${error.message}`);
    }
  }

  async testServiceMeshConfiguration() {
    console.log(chalk.blue('🔗 Testing service mesh configuration...'));
    
    try {
      // Test sidecar injection
      const productionLabels = execSync(`${this.kubectl} get namespace production -o jsonpath='{.metadata.labels.istio-injection}'`, { encoding: 'utf8' });
      const injectionEnabled = productionLabels.trim() === 'enabled';
      this.addResult('Sidecar Injection', injectionEnabled, injectionEnabled ? 'Sidecar injection enabled for production' : 'Sidecar injection not enabled');
      
      // Test mTLS policy
      const peerAuth = execSync(`${this.kubectl} get peerauthentication -n istio-system --no-headers | wc -l`, { encoding: 'utf8' });
      const hasMTLS = parseInt(peerAuth.trim()) > 0;
      this.addResult('mTLS Policy', hasMTLS, hasMTLS ? 'mTLS peer authentication configured' : 'mTLS peer authentication missing');
      
      // Test destination rules
      const destRules = execSync(`${this.kubectl} get destinationrules --all-namespaces --no-headers | wc -l`, { encoding: 'utf8' });
      const hasDestRules = parseInt(destRules.trim()) > 0;
      this.addResult('Destination Rules', hasDestRules, hasDestRules ? `${destRules.trim()} destination rules configured` : 'No destination rules found');
      
      // Test virtual services
      const virtualServices = execSync(`${this.kubectl} get virtualservices --all-namespaces --no-headers | wc -l`, { encoding: 'utf8' });
      const hasVirtualServices = parseInt(virtualServices.trim()) > 0;
      this.addResult('Virtual Services', hasVirtualServices, hasVirtualServices ? `${virtualServices.trim()} virtual services configured` : 'No virtual services found');
      
    } catch (error) {
      this.addResult('Service Mesh Configuration', false, `Failed to test service mesh: ${error.message}`);
    }
  }

  async testNetworkPolicies() {
    console.log(chalk.blue('🛡️  Testing network policies...'));
    
    try {
      // Test Calico installation
      const calicoPods = execSync(`${this.kubectl} get pods -n kube-system -l k8s-app=calico-node --no-headers | wc -l`, { encoding: 'utf8' });
      const hasCalico = parseInt(calicoPods.trim()) > 0;
      this.addResult('Calico CNI', hasCalico, hasCalico ? `${calicoPods.trim()} Calico nodes running` : 'Calico CNI not found');
      
      // Test network policies exist
      const networkPolicies = execSync(`${this.kubectl} get networkpolicies --all-namespaces --no-headers | wc -l`, { encoding: 'utf8' });
      const hasNetPolicies = parseInt(networkPolicies.trim()) > 0;
      this.addResult('Network Policies', hasNetPolicies, hasNetPolicies ? `${networkPolicies.trim()} network policies configured` : 'No network policies found');
      
      // Test pod-to-pod connectivity (basic test)
      const testPod = 'test-connectivity-pod';
      try {
        execSync(`${this.kubectl} run ${testPod} --image=busybox --rm -i --restart=Never -- nslookup kubernetes.default.svc.cluster.local`, { encoding: 'utf8' });
        this.addResult('Pod Connectivity', true, 'Pod-to-service connectivity working');
      } catch (error) {
        this.addResult('Pod Connectivity', false, 'Pod-to-service connectivity failed');
      }
      
    } catch (error) {
      this.addResult('Network Policies', false, `Failed to test network policies: ${error.message}`);
    }
  }

  async testAutoScaling() {
    console.log(chalk.blue('📈 Testing auto-scaling configuration...'));
    
    try {
      // Test metrics server
      const metricsServer = execSync(`${this.kubectl} get pods -n kube-system -l k8s-app=metrics-server --no-headers | wc -l`, { encoding: 'utf8' });
      const hasMetricsServer = parseInt(metricsServer.trim()) > 0;
      this.addResult('Metrics Server', hasMetricsServer, hasMetricsServer ? 'Metrics server is running' : 'Metrics server not found');
      
      // Test cluster autoscaler
      const autoscalerStatus = execSync(`${this.kubectl} get deployment cluster-autoscaler -n kube-system -o jsonpath='{.status.readyReplicas}'`, { encoding: 'utf8' });
      const autoscalerReady = parseInt(autoscalerStatus.trim()) > 0;
      this.addResult('Cluster Autoscaler', autoscalerReady, autoscalerReady ? 'Cluster autoscaler is ready' : 'Cluster autoscaler not ready');
      
      // Test node problem detector
      const nodeProblemDetector = execSync(`${this.kubectl} get daemonset node-problem-detector -n kube-system -o jsonpath='{.status.numberReady}'`, { encoding: 'utf8' });
      const npdReady = parseInt(nodeProblemDetector.trim()) > 0;
      this.addResult('Node Problem Detector', npdReady, npdReady ? `${nodeProblemDetector.trim()} node problem detector pods ready` : 'Node problem detector not ready');
      
    } catch (error) {
      this.addResult('Auto Scaling', false, `Failed to test auto-scaling: ${error.message}`);
    }
  }

  addResult(testName, passed, message) {
    this.testResults.push({ testName, passed, message });
    const icon = passed ? '✅' : '❌';
    const color = passed ? chalk.green : chalk.red;
    console.log(`  ${icon} ${color(testName)}: ${message}`);
  }

  printResults() {
    console.log(chalk.bold('\n📊 Test Results Summary:'));
    console.log(chalk.gray('='.repeat(60)));
    
    const passed = this.testResults.filter(r => r.passed).length;
    const failed = this.testResults.filter(r => !r.passed).length;
    const total = this.testResults.length;
    
    console.log(`Total Tests: ${total}`);
    console.log(chalk.green(`Passed: ${passed}`));
    console.log(chalk.red(`Failed: ${failed}`));
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
    
    if (failed > 0) {
      console.log(chalk.bold.red('\n❌ Failed Tests:'));
      this.testResults
        .filter(r => !r.passed)
        .forEach(r => console.log(chalk.red(`  • ${r.testName}: ${r.message}`)));
    }
  }
}

// CLI interface
if (require.main === module) {
  const tests = new InfrastructureTests();
  tests.runAllTests();
}

module.exports = InfrastructureTests;