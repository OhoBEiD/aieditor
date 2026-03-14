'use client';

import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { Sparkles, ChevronRight, AlertCircle, Check, HelpCircle } from 'lucide-react';
import type { Question } from '@/lib/ai/agents/RequirementGatheringAgent';

interface RequirementFormProps {
    questions: Question[];
    detectedTaskType: string;
    missingInfo: string[];
    onSubmit: (answers: Record<string, any>) => void;
}

export function RequirementForm({
    questions,
    detectedTaskType,
    missingInfo,
    onSubmit,
}: RequirementFormProps) {
    const [answers, setAnswers] = useState<Record<string, any>>({});
    const [currentStep, setCurrentStep] = useState(0);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const currentQuestion = questions[currentStep];
    const isLastQuestion = currentStep === questions.length - 1;
    const totalSteps = questions.length;

    // Update answer for current question
    const updateAnswer = (questionId: string, value: any) => {
        setAnswers(prev => ({ ...prev, [questionId]: value }));
        // Clear error when user starts typing
        if (errors[questionId]) {
            setErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors[questionId];
                return newErrors;
            });
        }
    };

    // Validate current question
    const validateCurrentQuestion = (): boolean => {
        if (!currentQuestion.required) return true;

        const value = answers[currentQuestion.id];
        if (!value || (Array.isArray(value) && value.length === 0) || value === '') {
            setErrors(prev => ({
                ...prev,
                [currentQuestion.id]: 'This field is required'
            }));
            return false;
        }

        return true;
    };

    // Handle next/submit
    const handleNext = () => {
        if (!validateCurrentQuestion()) return;

        if (isLastQuestion) {
            // Submit all answers
            onSubmit(answers);
        } else {
            // Move to next question
            setCurrentStep(prev => Math.min(prev + 1, questions.length - 1));
        }
    };

    // Handle skip (only for optional questions)
    const handleSkip = () => {
        if (isLastQuestion) {
            onSubmit(answers);
        } else {
            setCurrentStep(prev => Math.min(prev + 1, questions.length - 1));
        }
    };

    // Handle back
    const handleBack = () => {
        setCurrentStep(prev => Math.max(prev - 1, 0));
    };

    // Render form field based on question type
    const renderFormField = (question: Question) => {
        const value = answers[question.id];
        const hasError = !!errors[question.id];

        switch (question.type) {
            case 'text':
                return (
                    <input
                        type="text"
                        value={value || ''}
                        onChange={(e) => updateAnswer(question.id, e.target.value)}
                        placeholder={question.placeholder}
                        className={cn(
                            'w-full px-4 py-3 rounded-xl bg-white/5 border text-sm text-white/95 placeholder:text-white/30',
                            'focus:outline-none focus:ring-2 transition-all',
                            hasError
                                ? 'border-rose-400/40 focus:ring-rose-400/30'
                                : 'border-[#b69161]/30 focus:ring-[#c9a474]/40'
                        )}
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleNext();
                            }
                        }}
                    />
                );

            case 'textarea':
                return (
                    <textarea
                        value={value || ''}
                        onChange={(e) => updateAnswer(question.id, e.target.value)}
                        placeholder={question.placeholder}
                        rows={4}
                        className={cn(
                            'w-full px-4 py-3 rounded-xl bg-white/5 border text-sm text-white/95 placeholder:text-white/30 resize-none',
                            'focus:outline-none focus:ring-2 transition-all',
                            hasError
                                ? 'border-rose-400/40 focus:ring-rose-400/30'
                                : 'border-[#b69161]/30 focus:ring-[#c9a474]/40'
                        )}
                        autoFocus
                    />
                );

            case 'select':
                return (
                    <div className="space-y-2">
                        {question.options?.map((option) => (
                            <button
                                key={option}
                                onClick={() => updateAnswer(question.id, option)}
                                className={cn(
                                    'w-full px-4 py-3 rounded-xl border text-left text-sm transition-all',
                                    'hover:border-[#c9a474]/60 hover:bg-white/5',
                                    value === option
                                        ? 'border-[#b69161] bg-[#c9a474]/10 text-white/95'
                                        : 'border-[#b69161]/20 bg-transparent text-white/70'
                                )}
                            >
                                <div className="flex items-center gap-2.5">
                                    <div className={cn(
                                        'w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0',
                                        value === option
                                            ? 'border-[#b69161] bg-[#b69161]'
                                            : 'border-[#b69161]/40'
                                    )}>
                                        {value === option && <Check className="w-2.5 h-2.5 text-white" />}
                                    </div>
                                    <span>{option}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                );

            case 'multi-select':
                const selected = Array.isArray(value) ? value : [];
                return (
                    <div className="space-y-2">
                        {question.options?.map((option) => {
                            const isSelected = selected.includes(option);
                            return (
                                <button
                                    key={option}
                                    onClick={() => {
                                        if (isSelected) {
                                            updateAnswer(
                                                question.id,
                                                selected.filter(v => v !== option)
                                            );
                                        } else {
                                            updateAnswer(question.id, [...selected, option]);
                                        }
                                    }}
                                    className={cn(
                                        'w-full px-4 py-3 rounded-xl border text-left text-sm transition-all',
                                        'hover:border-[#c9a474]/60 hover:bg-white/5',
                                        isSelected
                                            ? 'border-[#b69161] bg-[#c9a474]/10 text-white/95'
                                            : 'border-[#b69161]/20 bg-transparent text-white/70'
                                    )}
                                >
                                    <div className="flex items-center gap-2.5">
                                        <div className={cn(
                                            'w-4 h-4 rounded border-2 flex items-center justify-center shrink-0',
                                            isSelected
                                                ? 'border-[#b69161] bg-[#b69161]'
                                                : 'border-[#b69161]/40'
                                        )}>
                                            {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                                        </div>
                                        <span>{option}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div className="my-3 rounded-2xl overflow-hidden">
            {/* Glass header */}
            <div className="relative px-4 py-3 dark-glass rounded-t-2xl">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-[#c9a474]/15 flex items-center justify-center">
                        <Sparkles className="w-3.5 h-3.5 text-[#c9a474]" />
                    </div>
                    <span className="text-xs font-semibold text-white/95 tracking-wide uppercase">
                        Help me understand your vision
                    </span>
                </div>
                <p className="mt-1.5 text-[11px] text-white/50 leading-relaxed">
                    {detectedTaskType === 'ecommerce' && 'Building your e-commerce store...'}
                    {detectedTaskType === 'landing_page' && 'Creating your landing page...'}
                    {detectedTaskType === 'dashboard' && 'Setting up your dashboard...'}
                    {detectedTaskType === 'portfolio' && 'Building your portfolio...'}
                    {detectedTaskType === 'blog' && 'Creating your blog...'}
                    {detectedTaskType === 'other' && 'Building your project...'}
                    {' '}I have a few quick questions to build this perfectly for you.
                </p>
            </div>

            {/* Progress indicator */}
            <div className="px-4 py-2.5 dark-glass-subtle border-x border-[rgba(182,145,97,0.15)]">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-white/50 font-medium">
                        Question {currentStep + 1} of {totalSteps}
                    </span>
                    <div className="flex items-center gap-1">
                        {questions.map((_, i) => (
                            <div
                                key={i}
                                className={cn(
                                    'w-1.5 h-1.5 rounded-full transition-all',
                                    i === currentStep
                                        ? 'bg-[#c9a474] w-3'
                                        : i < currentStep
                                            ? 'bg-[#b69161]'
                                            : 'bg-white/20'
                                )}
                            />
                        ))}
                    </div>
                </div>
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-[#b69161] to-[#c9a474] transition-all duration-300"
                        style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
                    />
                </div>
            </div>

            {/* Question form */}
            <div className="px-4 py-4 dark-glass-subtle border-x border-[rgba(182,145,97,0.15)]">
                <div className="mb-4">
                    <div className="flex items-start gap-2">
                        <label className="text-sm font-medium text-white/95 flex-1">
                            {currentQuestion.question}
                            {currentQuestion.required && (
                                <span className="text-rose-400 ml-1">*</span>
                            )}
                        </label>
                        {currentQuestion.helpText && (
                            <div className="group relative">
                                <HelpCircle className="w-3.5 h-3.5 text-white/40 hover:text-white/70 transition-colors" />
                                <div className="absolute right-0 top-6 w-64 p-2 rounded-lg bg-black/90 border border-white/10 text-[10px] text-white/80 leading-relaxed opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                                    {currentQuestion.helpText}
                                </div>
                            </div>
                        )}
                    </div>
                    {currentQuestion.required && (
                        <p className="text-[10px] text-white/40 mt-0.5">Required</p>
                    )}
                </div>

                {renderFormField(currentQuestion)}

                {errors[currentQuestion.id] && (
                    <div className="mt-2 flex items-center gap-1.5 text-rose-400">
                        <AlertCircle className="w-3 h-3" />
                        <span className="text-[11px]">{errors[currentQuestion.id]}</span>
                    </div>
                )}
            </div>

            {/* Navigation footer */}
            <div className="px-4 py-3 border border-t-0 border-[rgba(182,145,97,0.15)] rounded-b-2xl dark-glass-subtle">
                <div className="flex items-center justify-between gap-3">
                    {/* Back button */}
                    <button
                        onClick={handleBack}
                        disabled={currentStep === 0}
                        className={cn(
                            'px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all',
                            currentStep === 0
                                ? 'text-white/30 cursor-not-allowed'
                                : 'text-white/70 hover:text-white/95 hover:bg-white/5'
                        )}
                    >
                        Back
                    </button>

                    {/* Skip/Next/Submit */}
                    <div className="flex items-center gap-2">
                        {!currentQuestion.required && !isLastQuestion && (
                            <button
                                onClick={handleSkip}
                                className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-white/50 hover:text-white/70 hover:bg-white/5 transition-all"
                            >
                                Skip
                            </button>
                        )}
                        <button
                            onClick={handleNext}
                            className={cn(
                                'px-4 py-1.5 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1.5',
                                'bg-gradient-to-r from-[#b69161] to-[#c9a474] text-white',
                                'hover:from-[#a37d4e] hover:to-[#b89068] shadow-lg shadow-[#b69161]/20'
                            )}
                        >
                            {isLastQuestion ? (
                                <>
                                    Start Building
                                    <Sparkles className="w-3 h-3" />
                                </>
                            ) : (
                                <>
                                    Next
                                    <ChevronRight className="w-3 h-3" />
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
