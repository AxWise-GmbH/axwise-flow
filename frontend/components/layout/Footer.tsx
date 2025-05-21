"use client";

import Link from "next/link";
import { LogoFooter } from "@/components/icons";

/**
 * Footer component for the application
 * Contains links to legal pages and copyright information
 * Styled to match the static HTML pages
 */
export function Footer(): JSX.Element {
  return (
    <footer className="bg-[#232946] text-white py-8 mt-12 w-full">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-start justify-between gap-6">
          {/* Logo Section - Left aligned */}
          <div className="footer-logo w-full md:w-auto flex justify-center md:justify-start">
            <Link href="/">
              <LogoFooter
                width={120}
                height={30}
              />
            </Link>
          </div>

          <div className="flex flex-col items-center md:items-end gap-6 w-full md:w-auto">
            {/* Navigation Links */}
            <div className="flex flex-wrap justify-center gap-6">
              <Link
                href="/impressum.html"
                className="text-sm text-white no-underline transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-white/50"
              >
                Impressum
              </Link>
              <Link
                href="/privacy-policy.html"
                className="text-sm text-white no-underline transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-white/50"
              >
                Privacy Policy
              </Link>
              <Link
                href="/terms-of-service.html"
                className="text-sm text-white no-underline transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-white/50"
              >
                Terms of Service
              </Link>
              <Link
                href="/contact.html"
                className="text-sm text-white no-underline transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-white/50"
              >
                Contact
              </Link>
            </div>

            {/* Copyright Notice */}
            <p className="text-sm opacity-80 text-center md:text-right">
              &copy; {new Date().getFullYear()} AxWise UG (in formation). All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
