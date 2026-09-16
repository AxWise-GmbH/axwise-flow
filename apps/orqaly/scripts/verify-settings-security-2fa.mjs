#!/usr/bin/env node
/**
 * Settings security: verify Connect Google Sign-In + Enable/Manage Google Authenticator 2FA.
 * Open 2FA dialog, confirm QR attempt, verify form. No destructive actions.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5176';
const ROUTE = '/settings';

async function ensureLoggedIn(page) {
  await page.goto(BASE + '/register', { waitUntil: 'domcontentloaded', timeout: 10000 });
  await page.waitForTimeout(2000);
  const url = page.url();
  if (url.includes('/dashboard') || url.includes('/partners') || url.includes('/settings')) return true;
  if (!url.includes('/register') && !url.includes('/login')) return true;

  const email = `security-test-${Date.now()}@test.local`;
  const password = 'Testpass123!'; // strong: 10+ chars, upper, lower, digit, symbol
  const name = 'Security Test';
  await page.fill('input[name="email"], input[type="email"]', email);
  await page.fill('input[name="password"]', password);
  const confirmEl = page.locator('input[name="confirmPassword"], input[placeholder*="Confirm"]');
  if (await confirmEl.count()) await confirmEl.fill(password);
  const nameEl = page.locator('input[name="name"], input[placeholder*="Name"]');
  if (await nameEl.count()) await nameEl.fill(name);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  const after = page.url();
  return after.includes('/dashboard') || after.includes('/partners') || after.includes('/settings') || !after.includes('/login');
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(BASE + ROUTE, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);

    if (page.url().includes('/login') || page.url().includes('/register')) {
      const ok = await ensureLoggedIn(page);
      if (!ok) {
        console.log('FAIL: Could not authenticate');
        await browser.close();
        process.exit(1);
      }
      await page.goto(BASE + ROUTE, { waitUntil: 'networkidle', timeout: 20000 });
      await page.waitForTimeout(3000);
    }

    if (page.url().includes('/login') || page.url().includes('/register')) {
      console.log('FAIL: Still on login/register after auth. Cannot reach Settings.');
      await browser.close();
      process.exit(1);
    }

    await page.waitForTimeout(2000);
    await page.waitForSelector('text=Use YubiKey', { timeout: 15000 }).catch(() => {});

    const url = page.url();
    const title = await page.title();
    const html = await page.content();
    const hasConnectGoogle = html.includes('Connect Google Sign-In') || html.includes('Google account connected');
    const has2FAButton = html.includes('Enable Google Authenticator 2FA') || html.includes('Manage Google Authenticator 2FA');
    const hasSignInMethods = html.includes('Sign-in methods');
    const hasUseYubiKey = html.includes('Use YubiKey');
    const hasSecurity = html.includes('Security') || html.includes('Change password');

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);

    let dialogResult = { opened: false, qrGenerated: false, formPresent: false, message: null };

    if (has2FAButton) {
      await page.getByRole('button', { name: /Enable Google Authenticator 2FA|Manage Google Authenticator 2FA/ }).first().click({ timeout: 5000 });
      await page.waitForTimeout(2500); // Allow QR generation API call

      const dialogOpen = await page.locator('[role="dialog"]:has-text("Google Authenticator 2FA")').first().isVisible();
      dialogResult.opened = !!dialogOpen;

      if (dialogOpen) {
        const qrImg = page.locator('img[alt="QR code for Google Authenticator"]');
        const generatingBox = page.locator('text=Generating QR…');
        const noQrBox = page.locator('text=No QR code yet');
        const qrVisible = await qrImg.isVisible();
        const generating = await generatingBox.isVisible();
        const noQr = await noQrBox.isVisible();

        if (qrVisible) dialogResult.qrGenerated = true;
        else if (generating) dialogResult.qrGenerated = 'pending';
        else if (noQr) dialogResult.qrGenerated = false;

        const codeInput = page.locator('input[placeholder="123456"]');
        const verifyBtn = page.locator('button:has-text("Verify & Enable"), button:has-text("Verifying…")');
        dialogResult.formPresent = (await codeInput.isVisible()) && (await verifyBtn.count() > 0);

        const alert = page.locator('[role="alert"]').first();
        if (await alert.isVisible()) {
          dialogResult.message = await alert.textContent();
        }
      }
    }

    console.log('\n--- Settings Security Verification ---\n');
    console.log(`URL: ${url} | Title: ${title}`);
    console.log('Security section:');
    console.log(`  Connect Google Sign-In: ${hasConnectGoogle ? 'YES' : 'NO'}`);
    console.log(`  Enable/Manage Google Authenticator 2FA: ${has2FAButton ? 'YES' : 'NO'}`);
    console.log(`  Sign-in methods / Use YubiKey / Security: ${hasSignInMethods}/${hasUseYubiKey}/${hasSecurity}`);
    console.log('\n2FA dialog (opened, no destructive actions):');
    console.log(`  Dialog opened: ${dialogResult.opened ? 'YES' : 'NO'}`);
    console.log(`  QR generation: ${dialogResult.qrGenerated === true ? 'YES' : dialogResult.qrGenerated === 'pending' ? 'PENDING' : 'NO'}`);
    console.log(`  Form present (code input + Verify button): ${dialogResult.formPresent ? 'YES' : 'NO'}`);
    if (dialogResult.message) {
      console.log(`  Message: ${dialogResult.message.trim()}`);
    }
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
