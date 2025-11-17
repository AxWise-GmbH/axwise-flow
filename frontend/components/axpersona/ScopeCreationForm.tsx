'use client';

import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import type { BusinessContext } from '@/lib/axpersona/types';

interface ScopeCreationFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (context: BusinessContext) => void;
  isSubmitting?: boolean;
  errorMessage?: string;
}

export function ScopeCreationForm({
  open,
  onClose,
  onSubmit,
  isSubmitting,
  errorMessage,
}: ScopeCreationFormProps) {
  const [businessIdea, setBusinessIdea] = useState('');
  const [targetCustomer, setTargetCustomer] = useState('');
  const [problem, setProblem] = useState('');
  const [industry, setIndustry] = useState('');
  const [location, setLocation] = useState('');

  useEffect(() => {
    if (!open) {
      setBusinessIdea('');
      setTargetCustomer('');
      setProblem('');
      setIndustry('');
      setLocation('');
    }
  }, [open]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!businessIdea || !targetCustomer || !problem || !industry || !location) {
      return;
    }
    onSubmit({
      business_idea: businessIdea,
      target_customer: targetCustomer,
      problem,
      industry,
      location,
    });
  };

  const isValid =
    businessIdea.trim() &&
    targetCustomer.trim() &&
    problem.trim() &&
    industry.trim() &&
    location.trim();

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create AxPersona scope</DialogTitle>
          <DialogDescription>
            Describe your business context. The AxPersona pipeline will use this
            to generate synthetic interviews and personas for this scope.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="business-idea">Business idea</Label>
            <Textarea
              id="business-idea"
              value={businessIdea}
              onChange={(e) => setBusinessIdea(e.target.value)}
              placeholder="Short description of the product or service."
              rows={3}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="target-customer">Target customer</Label>
            <Textarea
              id="target-customer"
              value={targetCustomer}
              onChange={(e) => setTargetCustomer(e.target.value)}
              placeholder="Who are you building for? Segment, role, geography..."
              rows={2}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="problem">Problem</Label>
            <Textarea
              id="problem"
              value={problem}
              onChange={(e) => setProblem(e.target.value)}
              placeholder="What problem are you solving for this audience?"
              rows={2}
              required
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Input
                id="industry"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                placeholder="e.g. SaaS, Fintech"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Berlin, EU"
                required
              />
            </div>
          </div>
          {errorMessage && (
            <p className="text-sm text-destructive">{errorMessage}</p>
          )}
          <DialogFooter className="mt-2 flex items-center justify-between">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!isValid || isSubmitting}
            >
              {isSubmitting ? 'Generating dataset...' : 'Generate dataset'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

