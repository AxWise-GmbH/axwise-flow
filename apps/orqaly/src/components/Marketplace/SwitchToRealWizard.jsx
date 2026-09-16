import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Box,
  Typography,
  Chip,
  Stepper,
  Step,
  StepLabel,
  StepContent,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

import AppIcon from '../icons/AppIcon';

const SECTOR_LABELS = {
  gambling: 'iGaming',
  ecommerce: 'E-commerce',
  fintech: 'Fintech',
  affiliate: 'Affiliate Network',
};

const COMMON_STEPS = [
  {
    label: 'Company Formation',
    description:
      'Incorporate your entity legally. Firstbase handles US LLC/C-Corp end-to-end remotely ($399 all-in, including registered agent and EIN). For a UK Ltd, Companies House is the cheapest route at £12.',
    cost: '£12 – $399',
    time: '1–7 days',
    links: [
      { label: 'Firstbase.io (US LLC/C-Corp, $399 all-in)', url: 'https://firstbase.io' },
      {
        label: 'Companies House (UK Ltd, £12)',
        url: 'https://www.gov.uk/register-a-company-online',
      },
    ],
  },
  {
    label: 'Business Banking',
    description:
      'Open a multi-currency business account. Airwallex is free, global, and API-first — ideal for holding structures. Wise is affordable and broadly accepted. Mercury is US-only but excellent for startups.',
    cost: 'Free – £45',
    time: '1–3 days',
    links: [
      { label: 'Airwallex (free, global, API-first)', url: 'https://www.airwallex.com' },
      { label: 'Wise Business (£45 registration fee)', url: 'https://wise.com/gb/business' },
      { label: 'Mercury (US only, free)', url: 'https://mercury.com' },
    ],
  },
  {
    label: 'Virtual Mailbox',
    description:
      'Get a registered business address and mail forwarding in your target jurisdiction. Anytime Mailbox covers 47 countries and you can view and manage mail online.',
    cost: '$4.99–$9.99/mo',
    time: 'Same day',
    links: [{ label: 'Anytime Mailbox (47 countries)', url: 'https://www.anytimemailbox.com' }],
  },
  {
    label: 'KYC / AML',
    description:
      'Verify your identity and comply with anti-money laundering requirements. Sumsub supports all regulated sectors — iGaming, fintech, crypto — with automated identity, business, and document verification.',
    cost: 'Pay-per-verification',
    time: 'Immediate setup',
    links: [{ label: 'Sumsub (KYC / AML / KYB)', url: 'https://sumsub.com' }],
  },
];

const SECTOR_STEPS = {
  gambling: {
    label: 'iGaming License',
    description:
      'Curaçao CGA (Curaçao Gaming Authority) is the fastest and most cost-effective entry-point license for online gambling. It is accepted by most payment providers globally and covers casino, sports, and live verticals under a single master license.',
    cost: '~€30,000–€55,000',
    time: '3–6 months',
    links: [{ label: 'Curaçao Gaming Authority (CGA)', url: 'https://www.gaming-curacao.com' }],
  },
  fintech: {
    label: 'EMI / Payment License',
    description:
      'A Lithuania Electronic Money Institution license from the Bank of Lithuania is the most accessible EU-passportable payment license. Minimum capital requirement is €350,000. Once licensed, you can passport into all EU/EEA member states.',
    cost: '~€350k capital + €10k fees',
    time: '6–12 months',
    links: [
      {
        label: 'Bank of Lithuania (EMI Licensing)',
        url: 'https://www.lb.lt/en/licensing-of-financial-market-participants',
      },
    ],
  },
  affiliate: {
    label: 'Tracking Platform',
    description:
      'You need affiliate tracking software to manage partners, campaigns, commissions, and payouts at scale. Everflow is the industry standard for performance networks. Impact.com is a strong alternative for multi-channel partnership programs.',
    cost: '~$750–$1,000/mo',
    time: 'Same day',
    links: [
      { label: 'Everflow (affiliate tracking platform)', url: 'https://www.everflow.io' },
      { label: 'Impact.com (multi-channel partnerships)', url: 'https://impact.com' },
    ],
  },
  ecommerce: {
    label: 'Payment Processing',
    description:
      'Connect a payment processor to accept customer payments. Stripe is the easiest integration with broad global coverage and a developer-friendly API. Adyen is the enterprise-grade option for high-volume or omnichannel merchants.',
    cost: '1.4–2.9% + fixed fee',
    time: '1–2 days',
    links: [
      { label: 'Stripe (easiest, global)', url: 'https://stripe.com' },
      { label: 'Adyen (enterprise, high-volume)', url: 'https://www.adyen.com' },
    ],
  },
};

export default function SwitchToRealWizard({ open, onClose, sectorType }) {
  const [activeStep, setActiveStep] = useState(0);

  const sectorLabel = SECTOR_LABELS[sectorType] || '';
  const steps = sectorType
    ? [...COMMON_STEPS, SECTOR_STEPS[sectorType]].filter(Boolean)
    : COMMON_STEPS;

  const handleBack = () => setActiveStep((s) => Math.max(0, s - 1));
  const handleNext = () => setActiveStep((s) => Math.min(steps.length - 1, s + 1));

  const handleClose = () => {
    setActiveStep(0);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: 3 } } }}
    >
      <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', pr: 6, pb: 0.5 }}>
        Switch to Real{sectorLabel ? ` — ${sectorLabel}` : ''}
        <IconButton
          onClick={handleClose}
          size="small"
          sx={{ position: 'absolute', right: 12, top: 12 }}
        >
          <AppIcon name="Close" fallback={CloseIcon} sx={{ fontSize: 20 }} />
        </IconButton>
      </DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mb: 2, fontSize: '0.78rem' }}
        >
          A step-by-step path to turn your virtual {sectorLabel || 'company'} into a real, operating
          entity.
        </Typography>

        <Stepper activeStep={activeStep} orientation="vertical">
          {steps.map((step, index) => (
            <Step key={step.label}>
              <StepLabel>
                <Typography
                  variant="body2"
                  sx={{ fontWeight: index === activeStep ? 700 : 500, fontSize: '0.85rem' }}
                >
                  {step.label}
                </Typography>
              </StepLabel>
              <StepContent>
                <Box sx={{ display: 'flex', gap: 0.75, mb: 1, flexWrap: 'wrap' }}>
                  <Chip
                    size="small"
                    label={step.cost}
                    sx={{ height: 20, fontSize: '0.68rem', fontWeight: 600 }}
                  />
                  <Chip
                    size="small"
                    label={step.time}
                    variant="outlined"
                    sx={{ height: 20, fontSize: '0.68rem' }}
                  />
                </Box>

                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ fontSize: '0.8rem', lineHeight: 1.55, mb: 1.5 }}
                >
                  {step.description}
                </Typography>

                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 1.5 }}>
                  {step.links.map((link) => (
                    <Button
                      key={link.url}
                      size="small"
                      variant="outlined"
                      component="a"
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      endIcon={
                        <AppIcon name="OpenInNew" fallback={OpenInNewIcon} sx={{ fontSize: 13 }} />
                      }
                      sx={{
                        fontSize: '0.72rem',
                        textTransform: 'none',
                        justifyContent: 'flex-start',
                        borderRadius: 1.5,
                      }}
                    >
                      {link.label}
                    </Button>
                  ))}
                </Box>

                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button
                    size="small"
                    disabled={index === 0}
                    onClick={handleBack}
                    sx={{ fontSize: '0.75rem', textTransform: 'none' }}
                  >
                    Back
                  </Button>
                  {index < steps.length - 1 && (
                    <Button
                      size="small"
                      variant="contained"
                      onClick={handleNext}
                      sx={{ fontSize: '0.75rem', textTransform: 'none' }}
                    >
                      Next
                    </Button>
                  )}
                </Box>
              </StepContent>
            </Step>
          ))}
        </Stepper>

        {activeStep === steps.length - 1 && (
          <Box sx={{ mt: 2, p: 1.5, borderRadius: 2, bgcolor: 'action.hover' }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>
              These are referral-free links. Orqaly has no commercial relationship with these
              providers.
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={handleClose} sx={{ textTransform: 'none' }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
