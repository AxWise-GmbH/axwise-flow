"use client";

import Link from "next/link";

/**
 * Footer component for the application
 * Contains links to legal pages and copyright information
 */
export function Footer(): JSX.Element {
  return (
    <footer className="bg-primary text-primary-foreground py-4 mt-8 w-full border-t-2 border-primary-foreground/20">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="mb-2 md:mb-0">
            <p className="text-sm">
              &copy; {new Date().getFullYear()} AxWise UG (in formation). All
              rights reserved.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/contact"
              className="text-sm hover:underline focus:outline-none focus:ring-2 focus:ring-primary-foreground"
            >
              Contact Us
            </Link>
            <Link
              href="/impressum"
              className="text-sm hover:underline focus:outline-none focus:ring-2 focus:ring-primary-foreground"
            >
              Impressum
            </Link>
            <Link
              href="/privacy-policy"
              className="text-sm hover:underline focus:outline-none focus:ring-2 focus:ring-primary-foreground"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms-of-service"
              className="text-sm hover:underline focus:outline-none focus:ring-2 focus:ring-primary-foreground"
            >
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
