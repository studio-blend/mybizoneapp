'use client';

import { useState } from 'react';
import { Button } from '@mybizone/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@mybizone/ui/card';
import { Input } from '@mybizone/ui/input';
import { Label } from '@mybizone/ui/label';
import { completeSetupAction, validateLicenseSetupAction } from '../actions';

type StoreType = 'retail' | 'wholesale' | 'both';

interface FormData {
  businessName: string;
  gstin: string;
  city: string;
  phone: string;
  storeName: string;
  storeAddress: string;
  storeType: StoreType;
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  licenseKey: string;
}

const STEP_TITLES = [
  'Business Info',
  'Store Details',
  'Admin Account',
  'License Key',
];

const TOTAL_STEPS = 4;

export function SetupWizard() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [licenseStatus, setLicenseStatus] = useState<{ valid: boolean; plan?: string; error?: string } | null>(null);
  const [verifyingLicense, setVerifyingLicense] = useState(false);
  const [done, setDone] = useState(false);

  const [form, setForm] = useState<FormData>({
    businessName: '',
    gstin: '',
    city: '',
    phone: '',
    storeName: '',
    storeAddress: '',
    storeType: 'retail',
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    licenseKey: '',
  });

  function setField(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function validateStep(): boolean {
    const errs: Record<string, string> = {};

    if (step === 1) {
      if (!form.businessName.trim()) errs.businessName = 'Business name is required.';
      if (form.gstin && form.gstin.trim().length !== 15) errs.gstin = 'GSTIN must be 15 characters.';
    }

    if (step === 2) {
      if (!form.storeName.trim()) errs.storeName = 'Store name is required.';
    }

    if (step === 3) {
      if (!form.fullName.trim()) errs.fullName = 'Full name is required.';
      if (!form.email.trim() || !form.email.includes('@')) errs.email = 'Valid email is required.';
      if (form.password.length < 8) errs.password = 'Password must be at least 8 characters.';
      if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleVerifyLicense() {
    if (!form.licenseKey.trim()) return;
    setVerifyingLicense(true);
    setLicenseStatus(null);
    try {
      const result = await validateLicenseSetupAction(form.licenseKey.trim());
      if (result.valid) {
        setLicenseStatus({ valid: true, plan: result.plan });
      } else {
        setLicenseStatus({ valid: false, error: result.error ?? 'Invalid license key.' });
      }
    } catch {
      setLicenseStatus({ valid: false, error: 'Verification failed.' });
    } finally {
      setVerifyingLicense(false);
    }
  }

  async function handleSubmit() {
    setLoading(true);
    setErrors({});
    try {
      const result = await completeSetupAction({
        businessName: form.businessName.trim(),
        gstin: form.gstin.trim() || undefined,
        city: form.city.trim() || undefined,
        phone: form.phone.trim() || undefined,
        storeName: form.storeName.trim(),
        storeAddress: form.storeAddress.trim() || undefined,
        storeType: form.storeType,
        adminName: form.fullName.trim(),
        adminEmail: form.email.trim(),
        adminPassword: form.password,
        licenseKey: form.licenseKey.trim() || undefined,
      });
      if (result?.error) {
        setErrors({ submit: result.error });
        setLoading(false);
        return;
      }
      setDone(true);
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 2000);
    } catch (e) {
      setErrors({ submit: e instanceof Error ? e.message : 'Setup failed. Please try again.' });
      setLoading(false);
    }
  }

  function handleNext() {
    if (!validateStep()) return;
    if (step < TOTAL_STEPS) setStep(step + 1);
  }

  function handleBack() {
    if (step > 1) setStep(step - 1);
  }

  if (done) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-center text-green-700 dark:text-green-400">Setup Complete!</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground">Redirecting to your dashboard...</p>
        </CardContent>
      </Card>
    );
  }

  const progressPct = Math.round(((step - 1) / (TOTAL_STEPS - 1)) * 100);

  return (
    <Card>
      <CardHeader>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl">MyBizOne Setup</CardTitle>
            <span className="rounded-full border px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
              Step {step} of {TOTAL_STEPS}
            </span>
          </div>
          <p className="text-sm font-medium text-muted-foreground">{STEP_TITLES[step - 1]}</p>
          {/* Simple progress bar */}
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {step === 1 && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="businessName">Business Name *</Label>
              <Input
                id="businessName"
                value={form.businessName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('businessName', e.target.value)}
                placeholder="e.g. Sharma Traders"
              />
              {errors.businessName && <p className="text-xs text-destructive">{errors.businessName}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gstin">GSTIN <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                id="gstin"
                value={form.gstin}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('gstin', e.target.value.toUpperCase())}
                placeholder="15-character GSTIN"
                maxLength={15}
              />
              {errors.gstin && <p className="text-xs text-destructive">{errors.gstin}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={form.city}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('city', e.target.value)}
                  placeholder="e.g. Mumbai"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={form.phone}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('phone', e.target.value)}
                  placeholder="+91 98765 43210"
                />
              </div>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="storeName">Store Name *</Label>
              <Input
                id="storeName"
                value={form.storeName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('storeName', e.target.value)}
                placeholder="e.g. Main Branch"
              />
              {errors.storeName && <p className="text-xs text-destructive">{errors.storeName}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="storeAddress">Store Address</Label>
              <Input
                id="storeAddress"
                value={form.storeAddress}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('storeAddress', e.target.value)}
                placeholder="Street, area, city"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Store Type</Label>
              <div className="flex gap-2">
                {(['retail', 'wholesale', 'both'] as StoreType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setField('storeType', t)}
                    className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium capitalize transition-colors ${
                      form.storeType === t
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input hover:bg-accent hover:text-accent-foreground'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full Name *</Label>
              <Input
                id="fullName"
                value={form.fullName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('fullName', e.target.value)}
                placeholder="Your full name"
              />
              {errors.fullName && <p className="text-xs text-destructive">{errors.fullName}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email *</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('email', e.target.value)}
                placeholder="admin@example.com"
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password *</Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('password', e.target.value)}
                placeholder="Min. 8 characters"
              />
              {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword">Confirm Password *</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={form.confirmPassword}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField('confirmPassword', e.target.value)}
                placeholder="Repeat password"
              />
              {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword}</p>}
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              You can skip this step and start a free trial. Enter a license key to activate Pro plan.
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="licenseKey">License Key</Label>
              <div className="flex gap-2">
                <Input
                  id="licenseKey"
                  value={form.licenseKey}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    setField('licenseKey', e.target.value);
                    setLicenseStatus(null);
                  }}
                  placeholder="Paste your license key"
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleVerifyLicense}
                  disabled={!form.licenseKey.trim() || verifyingLicense}
                >
                  {verifyingLicense ? 'Checking...' : 'Verify'}
                </Button>
              </div>
            </div>
            {licenseStatus && (
              <div className={`rounded-md p-3 text-sm ${licenseStatus.valid ? 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200' : 'bg-destructive/10 text-destructive'}`}>
                {licenseStatus.valid
                  ? `Valid — ${licenseStatus.plan}`
                  : licenseStatus.error ?? 'Invalid license key.'}
              </div>
            )}
          </>
        )}

        {errors.submit && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {errors.submit}
          </div>
        )}
      </CardContent>

      <CardFooter className="flex justify-between gap-2">
        <Button variant="outline" onClick={handleBack} disabled={step === 1 || loading}>
          Back
        </Button>
        {step < TOTAL_STEPS ? (
          <Button onClick={handleNext} disabled={loading}>
            Next
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Setting up...' : 'Complete Setup'}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
