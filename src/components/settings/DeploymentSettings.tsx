'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import {
    Cloud,
    Triangle,
    Globe,
    Check,
    AlertCircle,
    Eye,
    EyeOff,
    ChevronDown,
    ChevronUp,
    Loader2,
    Rocket,
    Settings,
    GitBranch,
    Key,
    Link,
    Info
} from 'lucide-react';

// ============================================
// Types
// ============================================

type Provider = 'cloudflare' | 'vercel' | 'netlify';
type ConnectionStatus = 'not_configured' | 'configured' | 'error';

interface ProviderConfig {
    projectName: string;
    gitRepository: string;
    branch: string;
    apiToken: string;
    previewDomain: string;
}

interface ProviderInfo {
    id: Provider;
    name: string;
    description: string;
    icon: React.ReactNode;
    color: string;
}

// ============================================
// Provider Data
// ============================================

const providers: ProviderInfo[] = [
    {
        id: 'cloudflare',
        name: 'Cloudflare Pages',
        description: 'Global edge network',
        icon: <Cloud className="w-6 h-6" />,
        color: 'from-orange-500 to-orange-600',
    },
    {
        id: 'vercel',
        name: 'Vercel',
        description: 'Frontend cloud platform',
        icon: <Triangle className="w-6 h-6" />,
        color: 'from-black to-gray-800',
    },
    {
        id: 'netlify',
        name: 'Netlify',
        description: 'Web development platform',
        icon: <Globe className="w-6 h-6" />,
        color: 'from-teal-500 to-teal-600',
    },
];

// ============================================
// Sub-Components
// ============================================

/** Provider selection card */
function ProviderCard({
    provider,
    isSelected,
    onClick,
}: {
    provider: ProviderInfo;
    isSelected: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'relative flex flex-col items-center p-4 rounded-xl border-2 transition-all duration-200',
                'hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--accent-primary)]',
                isSelected
                    ? 'border-[var(--accent-primary)] bg-blue-50 shadow-sm'
                    : 'border-[var(--border-default)] bg-white hover:border-[var(--border-hover)]'
            )}
        >
            {/* Selected indicator */}
            {isSelected && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[var(--accent-primary)] flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                </div>
            )}

            {/* Icon */}
            <div className={cn(
                'w-12 h-12 rounded-lg flex items-center justify-center text-white bg-gradient-to-br mb-2',
                provider.color
            )}>
                {provider.icon}
            </div>

            {/* Name & description */}
            <span className="text-sm font-medium text-[var(--text-primary)]">{provider.name}</span>
            <span className="text-xs text-[var(--text-muted)]">{provider.description}</span>
        </button>
    );
}

/** Form input with label and helper text */
function FormField({
    label,
    helper,
    error,
    children,
}: {
    label: string;
    helper?: string;
    error?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[var(--text-primary)]">
                {label}
            </label>
            {children}
            {error ? (
                <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    {error}
                </p>
            ) : helper ? (
                <p className="text-xs text-[var(--text-muted)]">{helper}</p>
            ) : null}
        </div>
    );
}

/** Password input with show/hide toggle */
function PasswordInput({
    value,
    onChange,
    placeholder,
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
}) {
    const [show, setShow] = useState(false);

    return (
        <div className="relative">
            <input
                type={show ? 'text' : 'password'}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="w-full px-3 py-2 pr-10 text-sm rounded-lg border border-[var(--border-default)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent"
            />
            <button
                type="button"
                onClick={() => setShow(!show)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
        </div>
    );
}

/** Connection status badge */
function StatusBadge({ status }: { status: ConnectionStatus }) {
    const config = {
        not_configured: {
            label: 'Not configured',
            className: 'bg-gray-100 text-gray-600',
            icon: <Settings className="w-3 h-3" />,
        },
        configured: {
            label: 'Connected',
            className: 'bg-green-100 text-green-700',
            icon: <Check className="w-3 h-3" />,
        },
        error: {
            label: 'Error',
            className: 'bg-red-100 text-red-700',
            icon: <AlertCircle className="w-3 h-3" />,
        },
    }[status];

    return (
        <span className={cn(
            'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium',
            config.className
        )}>
            {config.icon}
            {config.label}
        </span>
    );
}

/** Toggle switch */
function Toggle({
    checked,
    onChange,
    label,
}: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
}) {
    return (
        <label className="flex items-center gap-3 cursor-pointer">
            <button
                role="switch"
                aria-checked={checked}
                onClick={() => onChange(!checked)}
                className={cn(
                    'relative w-10 h-6 rounded-full transition-colors',
                    checked ? 'bg-[var(--accent-primary)]' : 'bg-gray-200'
                )}
            >
                <span
                    className={cn(
                        'absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform',
                        checked && 'translate-x-4'
                    )}
                />
            </button>
            <span className="text-sm text-[var(--text-primary)]">{label}</span>
        </label>
    );
}

// ============================================
// Main Component
// ============================================

export function DeploymentSettings() {
    // Provider selection
    const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);

    // Configuration state (mock)
    const [config, setConfig] = useState<ProviderConfig>({
        projectName: '',
        gitRepository: 'https://github.com/example/repo',
        branch: 'main',
        apiToken: '',
        previewDomain: '',
    });

    // UI state
    const [isDeploying, setIsDeploying] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [autoDeployOnMerge, setAutoDeployOnMerge] = useState(false);
    const [previewDeployments, setPreviewDeployments] = useState(true);

    // Computed status
    const getConnectionStatus = (): ConnectionStatus => {
        if (!selectedProvider) return 'not_configured';
        if (!config.projectName || !config.apiToken) return 'not_configured';
        // Mock error for demo: if project name contains "error"
        if (config.projectName.toLowerCase().includes('error')) return 'error';
        return 'configured';
    };

    const status = getConnectionStatus();
    const canDeploy = status === 'configured';

    // Mock deploy handler
    const handleDeploy = async () => {
        if (!canDeploy) return;
        setIsDeploying(true);
        // Simulate deployment
        await new Promise((resolve) => setTimeout(resolve, 2000));
        setIsDeploying(false);
        alert('Deployment triggered! (Mock)');
    };

    // Update config helper
    const updateConfig = (field: keyof ProviderConfig, value: string) => {
        setConfig((prev) => ({ ...prev, [field]: value }));
    };

    return (
        <div className="p-4 space-y-6 overflow-y-auto max-h-full">
            {/* Header */}
            <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                    Deployment Settings
                </h2>
                <p className="text-sm text-[var(--text-muted)]">
                    Configure your deployment provider and settings
                </p>
            </div>

            {/* Provider Selection */}
            <section className="space-y-3">
                <h3 className="text-sm font-medium text-[var(--text-primary)]">
                    Select Provider
                </h3>
                <div className="grid grid-cols-3 gap-3">
                    {providers.map((provider) => (
                        <ProviderCard
                            key={provider.id}
                            provider={provider}
                            isSelected={selectedProvider === provider.id}
                            onClick={() => setSelectedProvider(provider.id)}
                        />
                    ))}
                </div>
            </section>

            {/* Configuration Form - only show if provider selected */}
            {selectedProvider && (
                <section className="space-y-4 p-4 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border-default)]">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium text-[var(--text-primary)]">
                            {providers.find((p) => p.id === selectedProvider)?.name} Configuration
                        </h3>
                        <StatusBadge status={status} />
                    </div>

                    <div className="space-y-4">
                        {/* Project Name */}
                        <FormField
                            label="Project / Site Name"
                            helper="The name of your project on the provider"
                            error={config.projectName.toLowerCase().includes('error') ? 'Invalid project name' : undefined}
                        >
                            <div className="relative">
                                <Rocket className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                                <input
                                    type="text"
                                    value={config.projectName}
                                    onChange={(e) => updateConfig('projectName', e.target.value)}
                                    placeholder="my-website"
                                    className="w-full pl-10 pr-3 py-2 text-sm rounded-lg border border-[var(--border-default)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent"
                                />
                            </div>
                        </FormField>

                        {/* Git Repository (read-only) */}
                        <FormField
                            label="Git Repository"
                            helper="Connected repository for deployments"
                        >
                            <div className="relative">
                                <GitBranch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                                <input
                                    type="text"
                                    value={config.gitRepository}
                                    readOnly
                                    className="w-full pl-10 pr-3 py-2 text-sm rounded-lg border border-[var(--border-default)] bg-gray-50 text-[var(--text-muted)] cursor-not-allowed"
                                />
                            </div>
                        </FormField>

                        {/* Branch */}
                        <FormField
                            label="Branch"
                            helper="The branch to deploy from"
                        >
                            <input
                                type="text"
                                value={config.branch}
                                onChange={(e) => updateConfig('branch', e.target.value)}
                                placeholder="main"
                                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--border-default)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent"
                            />
                        </FormField>

                        {/* API Token */}
                        <FormField
                            label="API Token / Key"
                            helper="Your provider API token for deployments"
                        >
                            <div className="relative">
                                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                                <div className="pl-8">
                                    <PasswordInput
                                        value={config.apiToken}
                                        onChange={(value) => updateConfig('apiToken', value)}
                                        placeholder="Enter your API token"
                                    />
                                </div>
                            </div>
                        </FormField>

                        {/* Preview Domain */}
                        <FormField
                            label="Preview Domain (optional)"
                            helper="Custom domain for preview deployments"
                        >
                            <div className="relative">
                                <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                                <input
                                    type="text"
                                    value={config.previewDomain}
                                    onChange={(e) => updateConfig('previewDomain', e.target.value)}
                                    placeholder="preview.example.com"
                                    className="w-full pl-10 pr-3 py-2 text-sm rounded-lg border border-[var(--border-default)] bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent"
                                />
                            </div>
                        </FormField>
                    </div>
                </section>
            )}

            {/* Deploy Button */}
            <div className="relative group">
                <button
                    onClick={handleDeploy}
                    disabled={!canDeploy || isDeploying}
                    className={cn(
                        'w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all',
                        canDeploy
                            ? 'bg-[var(--accent-primary)] text-white hover:bg-[var(--accent-primary-hover)] shadow-lg'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    )}
                >
                    {isDeploying ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Deploying...
                        </>
                    ) : (
                        <>
                            <Rocket className="w-5 h-5" />
                            Deploy Changes
                        </>
                    )}
                </button>

                {/* Tooltip */}
                {!canDeploy && (
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        {!selectedProvider
                            ? 'Select a deployment provider first'
                            : 'Complete the configuration to deploy'}
                        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                    </div>
                )}
            </div>

            {/* Advanced Section */}
            <section className="border border-[var(--border-default)] rounded-xl overflow-hidden">
                <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-white hover:bg-gray-50 transition-colors"
                >
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                        Advanced Settings
                    </span>
                    {showAdvanced ? (
                        <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" />
                    ) : (
                        <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />
                    )}
                </button>

                {showAdvanced && (
                    <div className="p-4 border-t border-[var(--border-default)] space-y-4">
                        <Toggle
                            checked={autoDeployOnMerge}
                            onChange={setAutoDeployOnMerge}
                            label="Enable automatic deploy on merge"
                        />

                        <Toggle
                            checked={previewDeployments}
                            onChange={setPreviewDeployments}
                            label="Create preview deployment for every change"
                        />

                        {/* Info block */}
                        <div className="flex gap-3 p-3 rounded-lg bg-blue-50 border border-blue-100">
                            <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                            <div className="text-xs text-blue-800">
                                <p className="font-medium mb-1">About Preview Deployments</p>
                                <p>
                                    Preview deployments create a unique URL for each change,
                                    allowing you to review before going live. They're automatically
                                    cleaned up after 30 days.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}
