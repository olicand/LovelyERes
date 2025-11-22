import { K8sPod, K8sDeployment, K8sService, K8sNode, K8sClusterStats } from './types';
import { sshConnectionManager } from '../remote/sshConnectionManager';

// Define interfaces for kubectl JSON output
interface KubectlList<T> {
    items: T[];
}

interface KubectlMetadata {
    name: string;
    namespace: string;
    creationTimestamp: string;
    labels?: Record<string, string>;
    uid: string;
}

interface KubectlPod {
    metadata: KubectlMetadata;
    status: {
        phase: string;
        podIP?: string;
        containerStatuses?: Array<{
            name: string;
            image: string;
            ready: boolean;
            restartCount: number;
        }>;
    };
    spec: {
        nodeName?: string;
        containers: Array<{
            name: string;
            image: string;
        }>;
    };
}

interface KubectlDeployment {
    metadata: KubectlMetadata;
    status: {
        replicas?: number;
        availableReplicas?: number;
        updatedReplicas?: number;
        conditions?: Array<{
            type: string;
            status: string;
        }>;
    };
    spec: {
        replicas: number;
    };
}

interface KubectlService {
    metadata: KubectlMetadata;
    spec: {
        type: string;
        clusterIP: string;
        externalIPs?: string[];
        ports?: Array<{
            name?: string;
            port: number;
            targetPort: number | string;
            protocol: string;
        }>;
    };
}

interface KubectlNode {
    metadata: KubectlMetadata;
    status: {
        conditions: Array<{
            type: string;
            status: string;
        }>;
        nodeInfo: {
            kubeletVersion: string;
        };
        addresses: Array<{
            type: string;
            address: string;
        }>;
        capacity: {
            cpu: string;
            memory: string;
            pods: string;
        };
        allocatable: {
            cpu: string;
            memory: string;
            pods: string;
        };
    };
}

export class KubernetesManager {
    constructor() {
        // No initialization needed for real data
    }

    private async executeKubectl(command: string): Promise<any> {
        if (!sshConnectionManager.isConnected()) {
            console.warn('SSH not connected, returning empty data for K8s');
            return null;
        }

        try {
            // Use dashboard command to avoid polluting terminal history
            const result = await (window as any).__TAURI__.core.invoke('ssh_execute_dashboard_command_direct', {
                command: `${command} -o json`
            });

            if (result.exit_code !== 0) {
                console.error(`Kubectl command failed: ${command}`, result.output);
                return null;
            }

            return JSON.parse(result.output);
        } catch (error) {
            console.error(`Failed to execute kubectl command: ${command}`, error);
            return null;
        }
    }

    public async getPods(namespace?: string): Promise<K8sPod[]> {
        const cmd = namespace
            ? `kubectl get pods -n ${namespace}`
            : `kubectl get pods --all-namespaces`;

        const data = await this.executeKubectl(cmd) as KubectlList<KubectlPod>;
        if (!data || !data.items) return [];

        return data.items.map(item => ({
            id: item.metadata.uid,
            name: item.metadata.name,
            namespace: item.metadata.namespace,
            creationTimestamp: item.metadata.creationTimestamp,
            labels: item.metadata.labels || {},
            status: (item.status.phase || 'Unknown') as K8sPod['status'],
            node: item.spec.nodeName || 'N/A',
            ip: item.status.podIP || '',
            restarts: item.status.containerStatuses?.reduce((sum, c) => sum + c.restartCount, 0) || 0,
            containers: item.status.containerStatuses?.map(c => ({
                name: c.name,
                image: c.image,
                ready: c.ready,
                restarts: c.restartCount
            })) || []
        }));
    }

    public async getDeployments(namespace?: string): Promise<K8sDeployment[]> {
        const cmd = namespace
            ? `kubectl get deployments -n ${namespace}`
            : `kubectl get deployments --all-namespaces`;

        const data = await this.executeKubectl(cmd) as KubectlList<KubectlDeployment>;
        if (!data || !data.items) return [];

        return data.items.map(item => {
            const conditions = item.status.conditions
                ?.filter(c => c.status === 'True')
                .map(c => c.type) || [];

            return {
                id: item.metadata.uid,
                name: item.metadata.name,
                namespace: item.metadata.namespace,
                creationTimestamp: item.metadata.creationTimestamp,
                labels: item.metadata.labels || {},
                replicas: item.spec.replicas || 0,
                availableReplicas: item.status.availableReplicas || 0,
                updatedReplicas: item.status.updatedReplicas || 0,
                conditions: conditions
            };
        });
    }

    public async getServices(namespace?: string): Promise<K8sService[]> {
        const cmd = namespace
            ? `kubectl get services -n ${namespace}`
            : `kubectl get services --all-namespaces`;

        const data = await this.executeKubectl(cmd) as KubectlList<KubectlService>;
        if (!data || !data.items) return [];

        return data.items.map(item => ({
            id: item.metadata.uid,
            name: item.metadata.name,
            namespace: item.metadata.namespace,
            creationTimestamp: item.metadata.creationTimestamp,
            labels: item.metadata.labels || {},
            type: (item.spec.type || 'ClusterIP') as K8sService['type'],
            clusterIP: item.spec.clusterIP,
            externalIPs: item.spec.externalIPs || [],
            ports: item.spec.ports?.map(p => ({
                name: p.name || '',
                port: p.port,
                targetPort: p.targetPort,
                protocol: (p.protocol || 'TCP') as 'TCP' | 'UDP' | 'SCTP'
            })) || []
        }));
    }

    public async getNodes(): Promise<K8sNode[]> {
        const data = await this.executeKubectl(`kubectl get nodes`) as KubectlList<KubectlNode>;
        if (!data || !data.items) return [];

        return data.items.map(item => {
            const readyCondition = item.status.conditions.find(c => c.type === 'Ready');
            const status = (readyCondition?.status === 'True' ? 'Ready' : 'NotReady') as K8sNode['status'];

            // Infer roles from labels (common convention)
            const roles = Object.keys(item.metadata.labels || {})
                .filter(k => k.startsWith('node-role.kubernetes.io/'))
                .map(k => k.split('/')[1]);

            return {
                name: item.metadata.name,
                status: status,
                roles: roles.length > 0 ? roles : ['worker'], // Default to worker if no specific role label
                version: item.status.nodeInfo.kubeletVersion,
                addresses: item.status.addresses,
                capacity: item.status.capacity,
                allocatable: item.status.allocatable
            };
        });
    }

    public async getClusterStats(): Promise<K8sClusterStats> {
        if (!sshConnectionManager.isConnected()) {
            return {
                totalPods: 0,
                runningPods: 0,
                totalDeployments: 0,
                totalServices: 0,
                totalNodes: 0,
                healthyNodes: 0,
                cpuUsage: 0,
                memoryUsage: 0
            };
        }

        // Parallel execution for better performance
        const [pods, deployments, services, nodes] = await Promise.all([
            this.getPods(),
            this.getDeployments(),
            this.getServices(),
            this.getNodes()
        ]);

        const runningPods = pods.filter(p => p.status === 'Running').length;
        const healthyNodes = nodes.filter(n => n.status === 'Ready').length;

        let cpuUsage = 0;
        let memoryUsage = 0;

        try {
            // kubectl top nodes --no-headers
            // Output: node-name   cpu(cores)   cpu%   memory(bytes)   memory%
            const topResult = await (window as any).__TAURI__.core.invoke('ssh_execute_dashboard_command_direct', {
                command: `kubectl top nodes --no-headers`
            });

            if (topResult.exit_code === 0 && topResult.output) {
                const lines = topResult.output.trim().split('\n');
                let totalCpuPercent = 0;
                let totalMemPercent = 0;
                let count = 0;

                lines.forEach((line: string) => {
                    const parts = line.trim().split(/\s+/);
                    if (parts.length >= 5) {
                        const cpu = parseInt(parts[2].replace('%', ''));
                        const mem = parseInt(parts[4].replace('%', ''));
                        if (!isNaN(cpu) && !isNaN(mem)) {
                            totalCpuPercent += cpu;
                            totalMemPercent += mem;
                            count++;
                        }
                    }
                });

                if (count > 0) {
                    cpuUsage = Math.round(totalCpuPercent / count);
                    memoryUsage = Math.round(totalMemPercent / count);
                }
            }
        } catch (e) {
            // Ignore errors from top (metrics server might not be installed)
        }

        return {
            totalPods: pods.length,
            runningPods: runningPods,
            totalDeployments: deployments.length,
            totalServices: services.length,
            totalNodes: nodes.length,
            healthyNodes: healthyNodes,
            cpuUsage: cpuUsage,
            memoryUsage: memoryUsage
        };
    }
}
